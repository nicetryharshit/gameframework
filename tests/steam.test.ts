import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  defaultSteamSettings, readSteamSettings, saveSteamSettings, steamAppIdFile, steamAppIdStep,
  addSteamToGame, chooseFolder, findSteamSdkRoot, installSteamSdk, steamChecks, steamFeatureDeclared, steamRuntimeStep, steamUsesSteam, validateSteamSettings
} from '../scripts/export-ui/steam.mjs';

async function withGame(run: (root: string) => Promise<void>) {
  const root = await mkdtemp(path.join(tmpdir(), 'steam-settings-'));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('an App ID is a whole number, and Steam is off by default', () => {
  assert.deepEqual(defaultSteamSettings(), { appId: '', buildWithSteam: false });
  assert.equal(validateSteamSettings({ appId: ' 480 ', buildWithSteam: true }).appId, '480');
  assert.throws(() => validateSteamSettings({ appId: 'abc' }), /whole number/);
  assert.throws(() => validateSteamSettings({ appId: '0' }), /whole number/);
});

test('settings are saved to steam.json and read back', () => withGame(async root => {
  assert.deepEqual(await readSteamSettings(root), defaultSteamSettings());
  await saveSteamSettings(root, { appId: '480', buildWithSteam: true });
  assert.deepEqual(await readSteamSettings(root), { appId: '480', buildWithSteam: true });
}));

test('only desktop builds can include Steam, and only when it is turned on', () => {
  const on = { appId: '480', buildWithSteam: true };
  assert.equal(steamUsesSteam('windows', on), true);
  assert.equal(steamUsesSteam('linux', on), true);
  assert.equal(steamUsesSteam('ios', on), false);
  assert.equal(steamUsesSteam('web', on), false);
  assert.equal(steamUsesSteam('windows', { appId: '480', buildWithSteam: false }), false);
});

test('the steam feature is recognised in Cargo.toml, and a comment does not count', () => {
  assert.equal(steamFeatureDeclared('[features]\nsteam = ["dep:steamworks"]\n'), true);
  assert.equal(steamFeatureDeclared('[features]\n# steam = ["dep:steamworks"]\n'), false);
  assert.equal(steamFeatureDeclared('[dependencies]\n'), false);
});

test('the Steam checks say what is missing, and pass once everything is in place', () => withGame(async root => {
  const missing = await steamChecks(root, { appId: '', buildWithSteam: true });
  assert.deepEqual(missing.map(check => check.ok), [false, false, false, false]);
  assert.ok(missing.slice(0, 3).every(check => check.blocking));
  assert.equal(missing[3].name, 'Steam code up to date');
  assert.equal(missing[3].blocking, false, 'out-of-date Steam code warns but does not stop builds');

  await mkdir(path.join(root, 'vendor/steamworks/sdk/public/steam'), { recursive: true });
  await mkdir(path.join(root, 'src-tauri'), { recursive: true });
  await writeFile(path.join(root, 'src-tauri/Cargo.toml'), '[features]\nsteam = ["dep:steamworks"]\n');
  const ready = await steamChecks(root, { appId: '480', buildWithSteam: true });
  assert.deepEqual(ready.slice(0, 3).map(check => check.ok), [true, true, true]);
}));

test('the development step writes steam_appid.txt next to the debug app', () => withGame(async root => {
  const step = steamAppIdStep(root, '480');
  const result = spawnSync(step.command, step.args, { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(await readFile(steamAppIdFile(root), 'utf8'), '480\n');
  assert.match(steamAppIdFile(root), /src-tauri[\\/]target[\\/]debug[\\/]steam_appid\.txt$/);
}));

async function fakeSdk(base: string) {
  const sdk = path.join(base, 'steamworks_sdk');
  await mkdir(path.join(sdk, 'public', 'steam'), { recursive: true });
  await mkdir(path.join(sdk, 'redistributable_bin', 'win64'), { recursive: true });
  await writeFile(path.join(sdk, 'public', 'steam', 'steam_api.h'), '// header');
  await writeFile(path.join(sdk, 'redistributable_bin', 'win64', 'steam_api64.dll'), 'dll');
  return sdk;
}

test('an unzipped SDK folder is copied into the game vendor folder', () => withGame(async root => withGame(async source => {
  const result = await installSteamSdk(root, await fakeSdk(source));
  assert.deepEqual(result.copied, ['public', 'redistributable_bin']);
  assert.equal(await readFile(path.join(root, 'vendor/steamworks/sdk/redistributable_bin/win64/steam_api64.dll'), 'utf8'), 'dll');
  assert.equal((await steamChecks(root, { appId: '', buildWithSteam: false }))[0].ok, true);
})));

test('a folder that is not the SDK is refused, and nothing is copied', () => withGame(async root => {
  await assert.rejects(installSteamSdk(root, path.join(root, 'nope')), /No Steamworks SDK found/);
  await assert.rejects(installSteamSdk(root, '   '), /Choose the unzipped Steamworks SDK folder/);
  assert.equal((await steamChecks(root, { appId: '', buildWithSteam: false }))[0].ok, false);
}));

test('the runtime library is copied next to the development app, and only where the platform has one', () => withGame(async root => withGame(async source => {
  await installSteamSdk(root, await fakeSdk(source));
  const step = steamRuntimeStep(root, 'windows');
  assert.ok(step);
  const result = spawnSync(step!.command, step!.args, { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(await readFile(path.join(root, 'src-tauri/target/debug/steam_api64.dll'), 'utf8'), 'dll');
  assert.equal(steamRuntimeStep(root, 'ios'), undefined);
})));

test('an SDK inside a versioned folder is found, and the folder it came from is reported', () => withGame(async root => withGame(async downloads => {
  const versioned = path.join(downloads, 'steamworks_sdk_165');
  await fakeSdk(versioned);
  await rename(path.join(versioned, 'steamworks_sdk'), path.join(versioned, 'sdk'));
  assert.equal(await findSteamSdkRoot(versioned), path.join(versioned, 'sdk'));
  const result = await installSteamSdk(root, versioned);
  assert.equal(result.foundIn, path.join('sdk'));
  assert.equal(await readFile(path.join(root, 'vendor/steamworks/sdk/redistributable_bin/win64/steam_api64.dll'), 'utf8'), 'dll');
})));

test('the folder picker is refused cleanly on systems without one', async () => {
  await assert.rejects(chooseFolder('freebsd'), /Browse is not available/);
});

const gameBefore = {
  build: 'fn main() {\n  tauri_build::build()\n}\n',
  cargo: '[package]\nname = "app"\n\n[dependencies]\nserde_json = "1.0"\n',
  lib: '#[tauri::command]\nfn platform_kind() -> &\'static str {\n  "desktop"\n}\n\npub fn run() {\n  tauri::Builder::default()\n    .invoke_handler(tauri::generate_handler![\n      platform_kind\n    ])\n    .run(tauri::generate_context!())\n    .expect("error");\n}\n',
  desktop: "import { invoke, isTauri } from '@tauri-apps/api/core';\n\nexport function createDesktopControls() {\n  return isTauri() ? invoke('platform_kind') : undefined;\n}\n"
};

async function frameworkWithSteam(base: string) {
  const framework = path.join(base, 'framework');
  await mkdir(path.join(framework, 'src-tauri', 'src'), { recursive: true });
  await mkdir(path.join(framework, 'src', 'platform'), { recursive: true });
  await writeFile(path.join(framework, 'src-tauri', 'src', 'steam.rs'), 'pub struct SteamState;\n');
  await writeFile(path.join(framework, 'src-tauri', 'build.rs'), 'fn main() {\n  tauri_build::build();\n  copy_steam_runtime();\n}\n');
  await writeFile(path.join(framework, 'src', 'platform', 'desktop.ts'), "import { invoke, isTauri } from '@tauri-apps/api/core';\n\nexport interface SteamControls {\n  available(): Promise<boolean>;\n}\n\nexport async function createSteamControls() {\n  return isTauri() ? invoke('steam_available') : undefined;\n}\n\n/** Steam test panel: debug only. */\nexport async function mountSteamTestPanel() {}\n");
  return framework;
}

async function gameWith(root: string, files: Record<string, string>) {
  for (const [file, text] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), text);
  }
}

test('a game made before Steam existed gets the Steam code, keeps its originals, and is unchanged on a second run', () => withGame(async root => withGame(async base => {
  const framework = await frameworkWithSteam(base);
  await gameWith(root, { 'src-tauri/build.rs': gameBefore.build, 'src-tauri/Cargo.toml': gameBefore.cargo, 'src-tauri/src/lib.rs': gameBefore.lib, 'src/platform/desktop.ts': gameBefore.desktop });
  const first = await addSteamToGame(root, framework);
  assert.ok(first.changed.includes('src-tauri/Cargo.toml'));
  const cargo = await readFile(path.join(root, 'src-tauri/Cargo.toml'), 'utf8');
  assert.match(cargo, /steam = \["dep:steamworks"\]/);
  assert.match(cargo, /steamworks = \{ version = "0.13.1", optional = true \}/);
  const lib = await readFile(path.join(root, 'src-tauri/src/lib.rs'), 'utf8');
  assert.match(lib, /^mod steam;/m);
  assert.match(lib, /\.manage\(steam::SteamState::start\(\)\)/);
  assert.match(lib, /steam::steam_available,/);
  assert.match(await readFile(path.join(root, 'src-tauri/build.rs'), 'utf8'), /copy_steam_runtime/);
  assert.match(await readFile(path.join(root, 'src/platform/desktop.ts'), 'utf8'), /export interface SteamControls/);
  assert.equal(await readFile(path.join(root, 'src-tauri/Cargo.toml.before-steam'), 'utf8'), gameBefore.cargo);
  assert.ok(await readFile(path.join(root, 'src-tauri/src/steam.rs'), 'utf8'));
  const second = await addSteamToGame(root, framework);
  assert.deepEqual(second.changed, []);
})));

test('Windows line endings are kept when the Steam code is added', () => withGame(async root => withGame(async base => {
  await gameWith(root, { 'src-tauri/build.rs': gameBefore.build, 'src-tauri/Cargo.toml': gameBefore.cargo.replace(/\n/g, '\r\n'), 'src-tauri/src/lib.rs': gameBefore.lib.replace(/\n/g, '\r\n'), 'src/platform/desktop.ts': gameBefore.desktop.replace(/\n/g, '\r\n') });
  await addSteamToGame(root, await frameworkWithSteam(base));
  const cargo = await readFile(path.join(root, 'src-tauri/Cargo.toml'), 'utf8');
  assert.ok(!/[^\r]\n/.test(cargo), 'every line ends with CRLF');
})));

test('a game whose lib.rs is not as expected is left untouched, with the fix explained', () => withGame(async root => withGame(async base => {
  const odd = gameBefore.lib.replace('tauri::Builder::default()', 'MyBuilder::new()').replace('tauri::generate_handler![', 'my_handler![');
  await gameWith(root, { 'src-tauri/build.rs': gameBefore.build, 'src-tauri/Cargo.toml': gameBefore.cargo, 'src-tauri/src/lib.rs': odd, 'src/platform/desktop.ts': gameBefore.desktop });
  await assert.rejects(addSteamToGame(root, await frameworkWithSteam(base)), /Add the Steam lines by hand/);
  assert.equal(await readFile(path.join(root, 'src-tauri/Cargo.toml'), 'utf8'), gameBefore.cargo);
  assert.equal(await readFile(path.join(root, 'src-tauri/src/lib.rs'), 'utf8'), odd);
})));

test('a Steam build in the Builds folder carries the runtime library next to the program', () => withGame(async root => withGame(async source => {
  await mkdir(path.join(root, 'src-tauri', 'target', 'release', 'bundle'), { recursive: true });
  await mkdir(path.join(root, 'src-tauri', 'target', 'release', 'bundle', 'nsis'), { recursive: true });
  await writeFile(path.join(root, 'src-tauri', 'Cargo.toml'), '[package]\nname = "app"\n');
  await writeFile(path.join(root, 'src-tauri', 'target', 'release', 'app.exe'), 'exe');
  await writeFile(path.join(root, 'src-tauri', 'target', 'release', 'bundle', 'nsis', 'Game_1.0.0_x64-setup.exe'), 'installer');
  await saveSteamSettings(root, { appId: '480', buildWithSteam: true });
  await installSteamSdk(root, await fakeSdk(source));
  const profile = { platform: 'windows', mode: 'release', name: 'Game', version: '1.0.0', identifier: 'com.test.game' };
  // builds.mjs has no type declarations; the shape is asserted by the test itself.
  // @ts-ignore
  const { collectArtifacts } = await import('../scripts/export-ui/builds.mjs') as unknown as { collectArtifacts(root: string, profile: object, job: object): Promise<{ directory: string }> };
  const result = await collectArtifacts(root, profile, { id: 'job1', started: new Date().toISOString() });
  assert.equal(await readFile(path.join(root, result.directory, 'steam_api64.dll'), 'utf8'), 'dll');
})));

test('the test panel is wired into the game entry, and a hand-copied panel import is switched to the framework copy', () => withGame(async root => withGame(async base => {
  const framework = await frameworkWithSteam(base);
  await gameWith(root, {
    'src-tauri/build.rs': gameBefore.build, 'src-tauri/Cargo.toml': gameBefore.cargo, 'src-tauri/src/lib.rs': gameBefore.lib, 'src/platform/desktop.ts': gameBefore.desktop,
    'index.html': '<body><script type="module" src="/src/main.ts"></script></body>', 'src/main.ts': "import './style.css';\nstart();\n"
  });
  await addSteamToGame(root, framework);
  const main = await readFile(path.join(root, 'src/main.ts'), 'utf8');
  assert.match(main, /^import \{ mountSteamTestPanel \} from 'gameframework\/desktop';/);
  assert.match(main, /void mountSteamTestPanel\(\);\n$/);
  assert.match(await readFile(path.join(root, 'src/platform/desktop.ts'), 'utf8'), /mountSteamTestPanel/);

  await writeFile(path.join(root, 'src/main.ts'), "import { mountSteamTestPanel } from './steam-test-panel';\nvoid mountSteamTestPanel();\n");
  await addSteamToGame(root, framework);
  assert.equal(await readFile(path.join(root, 'src/main.ts'), 'utf8'), "import { mountSteamTestPanel } from 'gameframework/desktop';\nvoid mountSteamTestPanel();\n");
})));

test('a dry run reports what would change and writes nothing', () => withGame(async root => withGame(async base => {
  const framework = await frameworkWithSteam(base);
  await gameWith(root, { 'src-tauri/build.rs': gameBefore.build, 'src-tauri/Cargo.toml': gameBefore.cargo, 'src-tauri/src/lib.rs': gameBefore.lib, 'src/platform/desktop.ts': gameBefore.desktop });
  const { changed } = await addSteamToGame(root, framework, { dryRun: true });
  assert.ok(changed.includes('src-tauri/Cargo.toml') && changed.includes('src-tauri/src/steam.rs'));
  assert.equal(await readFile(path.join(root, 'src-tauri/Cargo.toml'), 'utf8'), gameBefore.cargo);
  await assert.rejects(readFile(path.join(root, 'src-tauri/src/steam.rs'), 'utf8'));
})));
