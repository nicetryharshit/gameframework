// Steam settings for a game: its App ID, and whether desktop builds include Steam.
// Stored in steam.json at the game's root. Nothing here needs a Steam account, the SDK, or the Steam client.
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { access, cp, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const STEAM_SETTINGS = 'steam.json';
/** The framework this dashboard runs from: the source of the Steam code that Add Steam support copies into games. */
export const FRAMEWORK_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
/** Templates for Add Steam support. They live beside this dashboard, so every game copy has them. */
export const STEAM_TEMPLATE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'steam-template');
export const DESKTOP_PLATFORMS = ['windows', 'macos', 'linux'];
// Steam App IDs are positive whole numbers.
const APP_ID = /^[1-9]\d{0,9}$/;

export function defaultSteamSettings() {
  return { appId: '', buildWithSteam: false };
}

export function validateSteamSettings(value = {}) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Steam settings must be an object');
  const appId = String(value.appId ?? '').trim();
  if (appId && !APP_ID.test(appId)) throw new Error('A Steam App ID is a whole number, such as 480. Copy it from your Steamworks partner site.');
  return { appId, buildWithSteam: value.buildWithSteam === true };
}

export function readSteamSettingsSync(root) {
  try {
    return validateSteamSettings(JSON.parse(readFileSync(path.join(root, STEAM_SETTINGS), 'utf8')));
  } catch (error) {
    if (error.code === 'ENOENT') return defaultSteamSettings();
    throw new Error(`Could not read ${STEAM_SETTINGS}; fix or delete it before continuing`);
  }
}

export async function readSteamSettings(root) {
  try {
    return validateSteamSettings(JSON.parse(await readFile(path.join(root, STEAM_SETTINGS), 'utf8')));
  } catch (error) {
    if (error.code === 'ENOENT') return defaultSteamSettings();
    throw new Error(`Could not read ${STEAM_SETTINGS}; fix or delete it before continuing`);
  }
}

export async function saveSteamSettings(root, value) {
  const settings = validateSteamSettings(value);
  const file = path.join(root, STEAM_SETTINGS);
  const temporary = path.join(root, `.steam.${process.pid}.tmp`);
  await writeFile(temporary, JSON.stringify(settings, null, 2) + '\n');
  await rename(temporary, file);
  return settings;
}

/** True when the game's Cargo.toml declares the optional `steam` feature that turns on Steamworks. */
export function steamFeatureDeclared(cargoText) {
  return /^\s*steam\s*=\s*\[\s*"dep:steamworks"\s*\]/m.test(cargoText);
}

/** Whether a build with these settings includes Steam. Only desktop builds can, and only when the setting is on. */
export function steamUsesSteam(platform, settings) {
  return DESKTOP_PLATFORMS.includes(platform) && settings.buildWithSteam === true;
}

async function exists(file) { try { await access(file); return true; } catch { return false; } }

/** The Steam checks, shown on the Steam page and added to desktop builds that include Steam. */
export async function steamChecks(root, settings) {
  const sdk = await exists(path.join(root, 'vendor/steamworks/sdk/public/steam'));
  const cargo = await readFile(path.join(root, 'src-tauri/Cargo.toml'), 'utf8').catch(() => '');
  const feature = steamFeatureDeclared(cargo);
  const appId = APP_ID.test(settings.appId);
  return [
    {
      name: 'Steamworks SDK', ok: sdk, blocking: true,
      detail: sdk ? 'Found in vendor/steamworks/sdk' : 'Download the SDK from the Steamworks site (needs a free partner account), unzip it, and paste the folder into the SDK field below. Steps: docs/integrations/steam.md'
    },
    {
      name: 'Steam App ID', ok: appId, blocking: true,
      detail: appId ? `App ID ${settings.appId}` : 'Enter the App ID from your Steamworks partner site. Until then Steam stays off.'
    },
    {
      name: 'Steam feature in the game', ok: feature, blocking: true,
      detail: feature ? 'src-tauri/Cargo.toml declares the steam feature' : 'This game does not have the Steam code yet. Use Add Steam support on this page.'
    },
    await steamCodeCheck(root, feature)
  ];
}

/** Whether every Steam piece is in place and current. Builds still work without it, so it does not block them. */
async function steamCodeCheck(root, feature) {
  const name = 'Steam code up to date';
  if (!feature) return { name, ok: false, blocking: false, detail: 'Use Add Steam support on this page.' };
  try {
    const { changed } = await addSteamToGame(root, FRAMEWORK_ROOT, { dryRun: true });
    return changed.length
      ? { name, ok: false, blocking: false, detail: `Missing or out of date: ${changed.join(', ')}. Use Update Steam support on this page.` }
      : { name, ok: true, blocking: false, detail: 'Steam code, runtime copy and test panel are in place' };
  } catch (error) {
    return { name, ok: false, blocking: false, detail: error.message };
  }
}

/** Where the SDK lives inside a game, relative to the game's root. Steam checks look here. */
export const SDK_FOLDER = path.join('vendor', 'steamworks', 'sdk');

/** The Steamworks runtime library for each desktop platform, relative to the SDK's redistributable_bin folder. */
export const RUNTIME_LIBRARY = {
  windows: path.join('win64', 'steam_api64.dll'),
  macos: path.join('osx', 'libsteam_api.dylib'),
  linux: path.join('linux64', 'libsteam_api.so')
};

/**
 * Copies the Steamworks SDK from a folder the developer unzipped (the one that contains public/ and redistributable_bin/)
 * into this game's vendor folder. Nothing is downloaded and nothing is deleted outside vendor/steamworks/sdk.
 */
export async function installSteamSdk(root, sourcePath) {
  const given = path.resolve(String(sourcePath ?? '').trim() || '.');
  if (!String(sourcePath ?? '').trim()) throw new Error('Choose the unzipped Steamworks SDK folder, or paste its path.');
  const source = await findSteamSdkRoot(given);
  if (!source) {
    throw new Error(`No Steamworks SDK found in ${given}. Choose the folder that contains public and redistributable_bin, or the sdk folder inside it.`);
  }
  const foundIn = path.relative(given, source) || '.';
  const destination = path.join(root, SDK_FOLDER);
  if (path.resolve(destination) === source) return { destination: SDK_FOLDER, copied: [], foundIn };
  await mkdir(destination, { recursive: true });
  await rm(path.join(destination, 'public'), { recursive: true, force: true });
  await rm(path.join(destination, 'redistributable_bin'), { recursive: true, force: true });
  await cp(path.join(source, 'public'), path.join(destination, 'public'), { recursive: true });
  await cp(path.join(source, 'redistributable_bin'), path.join(destination, 'redistributable_bin'), { recursive: true });
  return { destination: SDK_FOLDER, copied: ['public', 'redistributable_bin'], foundIn };
}

async function isSteamSdk(folder) {
  return (await exists(path.join(folder, 'public', 'steam', 'steam_api.h'))) && (await exists(path.join(folder, 'redistributable_bin')));
}

/**
 * The folder that holds public/ and redistributable_bin: the folder itself, or a subfolder up to two levels down.
 * Steam zips often unpack into a versioned folder with an sdk folder inside, so the dashboard finds it either way.
 */
export async function findSteamSdkRoot(folder, depth = 2) {
  if (await isSteamSdk(folder)) return folder;
  if (depth === 0) return undefined;
  const entries = await readdir(folder, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const found = await findSteamSdkRoot(path.join(folder, entry.name), depth - 1);
    if (found) return found;
  }
  return undefined;
}

/**
 * Opens the system's folder picker on this computer and returns the chosen path, or undefined if the person cancels.
 * The dashboard runs locally, so the picker opens on the same machine as the browser.
 */
export function chooseFolder(platform = process.platform) {
  const prompt = 'Choose the unzipped Steamworks SDK folder';
  const picker = {
    win32: ['powershell.exe', ['-NoProfile', '-STA', '-Command', `Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.FolderBrowserDialog; $d.Description = '${prompt}'; if ($d.ShowDialog() -eq 'OK') { Write-Output $d.SelectedPath }`]],
    darwin: ['osascript', ['-e', `POSIX path of (choose folder with prompt "${prompt}")`]],
    linux: ['zenity', ['--file-selection', '--directory', `--title=${prompt}`]]
  }[platform];
  const unavailable = 'Browse is not available on this computer. Paste the folder path instead.';
  if (!picker) return Promise.reject(new Error(unavailable));
  return new Promise((resolve, reject) => {
    const child = spawn(picker[0], picker[1], { windowsHide: true });
    let output = '';
    child.stdout.on('data', data => { output += data; });
    child.stderr.on('data', () => {});
    child.on('error', () => reject(new Error(unavailable)));
    child.on('close', code => resolve(code === 0 && output.trim() ? output.trim() : undefined));
  });
}

/**
 * A build step that copies the Steamworks runtime library next to a development app, which it loads at start-up.
 * It is skipped with a note when the SDK is not installed or the platform has no library.
 */
export function steamRuntimeStep(root, platform) {
  const library = RUNTIME_LIBRARY[platform];
  if (!library) return undefined;
  const from = path.join(root, SDK_FOLDER, 'redistributable_bin', library);
  const to = path.join(root, 'src-tauri', 'target', 'debug', path.basename(library));
  const script = "const fs = require('fs'); const path = require('path'); const [from, to] = process.argv.slice(1); if (!fs.existsSync(from)) { console.log('Steamworks runtime not found; install the SDK on the Steam page: ' + from); process.exit(0); } fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to); console.log('Copied Steamworks runtime to ' + to);";
  return { command: process.execPath, args: ['-e', script, from, to], title: 'Copy the Steamworks runtime library for local runs' };
}

/**
 * Adds the Steam code to a game that was created before it existed: the steam feature and dependency in Cargo.toml,
 * the steam module and commands in src-tauri/src, and the Steam calls in src/platform/desktop.ts.
 * Every change is computed first; if any anchor is missing nothing is written. Originals are kept as <file>.before-steam.
 * Running it again changes nothing.
 */
export async function addSteamToGame(root, frameworkRoot = FRAMEWORK_ROOT, { dryRun = false } = {}) {
  const sources = {
    rust: path.join(STEAM_TEMPLATE, 'steam.rs'),
    build: path.join(STEAM_TEMPLATE, 'build.rs'),
    desktop: path.join(frameworkRoot, 'src', 'platform', 'desktop.ts')
  };
  if (!(await exists(sources.rust)) || !(await exists(sources.build))) {
    throw new Error('Could not find the Steam code templates in Game Workshop (scripts/export-ui/steam-template). Update tools in Game Workshop and try again.');
  }
  if (!(await exists(sources.desktop))) {
    throw new Error(`Could not find src/platform/desktop.ts in ${frameworkRoot}. Update tools in Game Workshop and try again.`);
  }
  const manual = (file, what) => new Error(`Could not add Steam to ${file} automatically (${what}). Add the Steam lines by hand, following section 3 of docs/integrations/steam.md.`);
  const read = async file => readFile(path.join(root, file), 'utf8').catch(error => { if (error.code === 'ENOENT') return undefined; throw error; });
  const planned = [];
  const plan = async (file, edit) => {
    const before = await read(file);
    const eol = before?.includes('\r\n') ? '\r\n' : '\n';
    const current = before?.replace(/\r\n/g, '\n');
    const next = await edit(current);
    if (next !== undefined && next !== current) planned.push({ file, before, text: next.replace(/\n/g, eol) });
  };

  // The game imports desktop controls from its framework copy in tools/gameframework; older layouts keep them in src/platform.
  const desktopFile = await exists(path.join(root, 'tools', 'gameframework', 'src', 'platform', 'desktop.ts'))
    ? 'tools/gameframework/src/platform/desktop.ts'
    : 'src/platform/desktop.ts';
  const rustFile = 'src-tauri/src/steam.rs';
  if (!(await read(rustFile))) planned.push({ file: rustFile, before: undefined, text: await readFile(sources.rust, 'utf8') });

  await plan('src-tauri/Cargo.toml', cargo => {
    if (cargo === undefined) throw manual('src-tauri/Cargo.toml', 'the file is missing');
    let next = cargo;
    if (!steamFeatureDeclared(next)) {
      const block = '# Steamworks achievements and stats. See docs/integrations/steam.md.\nsteam = ["dep:steamworks"]';
      next = /^\[features\][ \t]*$/m.test(next) ? next.replace(/^\[features\][ \t]*$/m, `[features]\n${block}`) : `${next.trimEnd()}\n\n[features]\n${block}\n`;
    }
    if (!/^\s*steamworks\s*=/m.test(next)) {
      const line = 'steamworks = { version = "0.13.1", optional = true }';
      next = /^\[dependencies\][ \t]*$/m.test(next) ? next.replace(/^\[dependencies\][ \t]*$/m, `[dependencies]\n${line}`) : `${next.trimEnd()}\n\n[dependencies]\n${line}\n`;
    }
    return next;
  });

  await plan('src-tauri/src/lib.rs', lib => {
    if (lib === undefined) throw manual('src-tauri/src/lib.rs', 'the file is missing');
    let next = lib;
    if (!/^mod steam;/m.test(next)) next = `mod steam;\n\n${next}`;
    if (!next.includes('steam::SteamState::start()')) {
      if (!/^\s*tauri::Builder::default\(\)\s*$/m.test(next)) throw manual('src-tauri/src/lib.rs', 'no tauri::Builder::default() line found');
      next = next.replace(/^(\s*)tauri::Builder::default\(\)\s*$/m, (match, indent) => `${match}\n${indent}  .manage(steam::SteamState::start())`);
    }
    if (!next.includes('steam::steam_available')) {
      if (!/tauri::generate_handler!\[\n/.test(next)) throw manual('src-tauri/src/lib.rs', 'no tauri::generate_handler![ list found');
      next = next.replace(/(tauri::generate_handler!\[\n)(\s*)/, (match, head, indent) => `${head}${indent}steam::steam_available,\n${indent}steam::steam_unlock_achievement,\n${indent}steam::steam_set_stat_i32,\n${indent}`);
    }
    return next;
  });

  const frameworkBuild = await readFile(sources.build, 'utf8').catch(() => undefined);
  if (!frameworkBuild) throw new Error('Could not read the Steam build script template. Update tools in Game Workshop and try again.');
  await plan('src-tauri/build.rs', build => {
    if (build === undefined) throw manual('src-tauri/build.rs', 'the file is missing');
    if (build.includes('copy_steam_runtime')) return build;
    if (build.replace(/\s+/g, '') !== 'fnmain(){tauri_build::build()}') throw manual('src-tauri/build.rs', 'the build script has changes that are not in the template');
    return frameworkBuild;
  });

  await plan(desktopFile, desktop => {
    if (desktop === undefined) throw manual(desktopFile, 'the file is missing');
    const framework = readFileSync(sources.desktop, 'utf8').replace(/\r\n/g, '\n');
    const panelStart = framework.indexOf('/** Steam test panel');
    let next = desktop;
    if (!next.includes('createSteamControls')) {
      if (!/^import \{[^}]*\binvoke\b[^}]*\} from '@tauri-apps\/api\/core';/m.test(next) || !/\bisTauri\b/.test(next)) {
        throw manual(desktopFile, 'the Tauri imports are not as expected');
      }
      const controls = framework.slice(framework.indexOf('export interface SteamControls'), panelStart === -1 ? undefined : panelStart).trimEnd();
      next = `${next.trimEnd()}\n\n${controls}\n`;
    }
    // Games that got the Steam controls before the test panel existed get the panel on its own.
    if (panelStart !== -1 && !next.includes('mountSteamTestPanel')) next = `${next.trimEnd()}\n\n${framework.slice(panelStart).trimEnd()}\n`;
    return next;
  });

  // The game's entry script (named in index.html) shows the test panel. It does nothing in release builds.
  const entry = (await read('index.html'))?.match(/<script[^>]*type="module"[^>]*src="\/?([^"]+\.(?:ts|js))"/)?.[1];
  if (entry) {
    await plan(entry, code => {
      if (code === undefined) return undefined;
      const fromFramework = "import { mountSteamTestPanel } from 'gameframework/desktop';";
      // A hand-copied panel from before lived in src/steam-test-panel.ts; use the framework's copy instead.
      let next = code.replace(/^import \{ mountSteamTestPanel \} from '\.\/steam-test-panel';$/m, fromFramework);
      if (!next.includes('mountSteamTestPanel')) next = `${fromFramework}\n${next.trimEnd()}\n\nvoid mountSteamTestPanel();\n`;
      return next;
    });
  }

  if (dryRun) return { changed: planned.map(change => change.file) };

  for (const change of planned) {
    const backup = path.join(root, `${change.file}.before-steam`);
    if (change.before !== undefined && !(await exists(backup))) await writeFile(backup, change.before);
    await mkdir(path.dirname(path.join(root, change.file)), { recursive: true });
    await writeFile(path.join(root, change.file), change.text);
  }
  return { changed: planned.map(change => change.file) };
}

export function steamAppIdFile(root) {
  return path.join(root, 'src-tauri', 'target', 'debug', 'steam_appid.txt');
}

/**
 * A build step that writes steam_appid.txt next to the development app, so Steam recognises local runs.
 * Only development runs get it; release builds never contain the file.
 */
export function steamAppIdStep(root, appId) {
  const script = "const fs = require('fs'); const path = require('path'); fs.mkdirSync(path.dirname(process.argv[1]), { recursive: true }); fs.writeFileSync(process.argv[1], process.argv[2] + '\\n');";
  return { command: process.execPath, args: ['-e', script, steamAppIdFile(root), appId], title: 'Write steam_appid.txt for local Steam runs' };
}
