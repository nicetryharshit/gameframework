import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
// @ts-expect-error Plain Node tooling module.
import { buildPlan, checkPlatform, initConfig, validateIosSettings, updateIosProject, moveIosProjectAside, iosBuildSettings, defaultIdentifier } from '../scripts/export-ui/builds.mjs';
// @ts-expect-error Plain Node tooling module.
import { startExportUI } from '../scripts/export-ui/server.mjs';

const profile = { platform: 'web', mode: 'development', name: 'Test game', version: '1.0.0', identifier: 'com.test.game' };

test('the framework folder creates and opens games, other folders cannot, and install/test are planned', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workshop-'));
  const framework = path.join(root, 'gameframework');
  const plain = path.join(root, 'plain-game');
  let app: { url: string; close(): Promise<void> } | undefined;
  try {
    await mkdir(framework); await mkdir(plain);
    await writeFile(path.join(framework, 'package.json'), JSON.stringify({ name: 'gameframework', version: '0.1.0', scripts: { test: 'echo ok' } }));
    await writeFile(path.join(plain, 'package.json'), JSON.stringify({ name: 'plain-game', version: '0.1.0' }));
    assert.equal(buildPlan(framework, profile, 'install')[0].title, 'Install dependencies');
    assert.equal(buildPlan(framework, profile, 'test')[0].title, 'Run tests');
    assert.throws(() => buildPlan(plain, profile, 'test'), /no tests/);

    const live = await startExportUI(framework, 0) as { url: string; close(): Promise<void> };
    app = live;
    const base = live.url;
    const html = await (await fetch(base)).text();
    const token = html.match(/name="export-token" content="([^"]+)"/)![1];
    const headers = { 'X-Export-Token': token, Origin: base, 'Content-Type': 'application/json' };
    const post = (route: string, body: unknown) => fetch(`${base}/api/${route}`, { method: 'POST', headers, body: JSON.stringify(body) });
    const state = await (await fetch(`${base}/api/state`, { headers: { 'X-Export-Token': token } })).json();
    assert.equal(state.project.kind, 'framework');
    assert.equal(state.project.hasTests, true);
    assert.equal((await post('create', { name: '!!!', renderer: '2d' })).status, 400);
    assert.equal((await post('create', { name: 'Fine game', renderer: 'sideways' })).status, 400);
    assert.equal((await post('open-game', { folder: '../etc' })).status, 400);
    assert.equal((await post('open-game', { folder: 'missing-game' })).status, 400);

    // A real game folder (marked by its bundled dashboard) shows up in the games list; plain folders do not.
    const game = path.join(root, 'sample-game');
    await mkdir(path.join(game, 'tools', 'gameframework', 'scripts', 'export-ui'), { recursive: true });
    await writeFile(path.join(game, 'tools', 'gameframework', 'scripts', 'export-ui', 'server.mjs'), '');
    await writeFile(path.join(game, 'tools', 'gameframework', 'VERSION.json'), JSON.stringify({ version: '0.0.1' }));
    await writeFile(path.join(game, 'package.json'), JSON.stringify({ name: 'sample-game', dependencies: { three: '1.0.0' } }));
    await mkdir(path.join(framework, 'scripts'), { recursive: true });
    await writeFile(path.join(framework, 'scripts', 'create-game.mjs'), "export const frameworkVersion = async () => ({ version: '9.9.9', revision: 'abc123' });\nexport const inspectGame = async () => ({ version: '0.0.1', revision: 'old000', outdated: true, components: [] });\nexport const gameRenderer = async () => 'three';\nexport const readRegistry = async () => [{ id: 'three', label: 'Three.js', kind: '3d', note: 'WebGL scenes' }];\n");
    const listed = await (await fetch(`${base}/api/games`, { headers: { 'X-Export-Token': token } })).json();
    assert.deepEqual(listed.games.map((game: { folder: string; renderer: string; update: { outdated: boolean } }) => [game.folder, game.renderer, game.update.outdated]), [['sample-game', 'three', true]]);
    assert.deepEqual(listed.framework, { version: '9.9.9', revision: 'abc123' });
  } finally { await app?.close(); await rm(root, { recursive: true, force: true }); }
});

test('mobile checks require rustup and the mobile targets, not just rustc', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workshop-rustup-'));
  try {
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'g', version: '0.1.0' }));
    // Simulate a machine with rustc but no rustup on the PATH the dashboard sees.
    const saved = process.env.PATH;
    process.env.PATH = root;
    try {
      const result = await checkPlatform(root, 'ios', 'darwin');
      const rustup = result.checks.find((item: { name: string }) => item.name === 'rustup');
      assert.ok(rustup, 'iOS checks rustup');
      assert.equal(rustup.ok, false);
      assert.match(rustup.detail, /rustup was not found.*rustup\.rs/);
      assert.equal(result.checks.some((item: { name: string }) => item.name === 'Rust mobile targets'), false, 'targets are only checked once rustup exists');
    } finally { process.env.PATH = saved; }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('iOS settings validate, reach the Xcode setup config, and lock once the project exists', async () => {
  // Validation: empty means "use the default"; bad values are refused with a plain message.
  assert.equal(validateIosSettings({ displayName: '  ', identifier: '' }), undefined);
  assert.deepEqual(validateIosSettings({ displayName: 'Pocket Flight', buildNumber: '1.2', minimumVersion: '16.0', identifier: 'com.studio.flight' }),
    { displayName: 'Pocket Flight', buildNumber: '1.2', minimumVersion: '16.0', identifier: 'com.studio.flight' });
  assert.equal(defaultIdentifier('Pocket Flight'), 'com.game.pocketflight');
  assert.equal(defaultIdentifier('My-Game 2'), 'com.game.mygame2');
  assert.equal(defaultIdentifier(''), 'com.game.game');
  assert.throws(() => validateIosSettings({ buildNumber: 'abc' }), /Build number/);
  assert.throws(() => validateIosSettings({ minimumVersion: 'latest' }), /Minimum iOS version/);
  assert.throws(() => validateIosSettings({ identifier: 'nodots' }), /identifier/);

  // Setup config: the shared values are the default; iOS values override only for iOS.
  const shared = { platform: 'ios', mode: 'development', name: 'Game', version: '1.0.0', identifier: 'com.studio.game' };
  assert.deepEqual(initConfig(shared), { productName: 'Game', version: '1.0.0', identifier: 'com.studio.game' });
  const custom = { ...shared, ios: { displayName: 'Pocket Flight', buildNumber: '3', minimumVersion: '16.0' } };
  assert.deepEqual(initConfig(custom), { productName: 'Pocket Flight', version: '1.0.0', identifier: 'com.studio.game', bundle: { iOS: { bundleVersion: '3', minimumSystemVersion: '16.0' } } });
  assert.deepEqual(initConfig({ ...custom, platform: 'android' }), { productName: 'Game', version: '1.0.0', identifier: 'com.studio.game' }, 'iOS settings do not leak into Android');

  // The setup step actually receives that config.
  const plan = buildPlan(process.cwd(), { ...custom, mode: 'development' }, 'initialize', 'darwin');
  const config = JSON.parse(plan[0].args[plan[0].args.indexOf('--config') + 1]);
  assert.equal(config.productName, 'Pocket Flight');

  // The save endpoint writes to both iOS modes, and refuses once the Xcode project exists.
  const root = await mkdtemp(path.join(tmpdir(), 'workshop-ios-'));
  let app: { url: string; close(): Promise<void> } | undefined;
  try {
    await mkdir(path.join(root, 'src-tauri'), { recursive: true });
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'game', version: '0.1.0' }));
    await writeFile(path.join(root, 'src-tauri', 'tauri.conf.json'), JSON.stringify({ productName: 'Game', version: '1.0.0', identifier: 'com.studio.game' }));
    app = await startExportUI(root, 0) as { url: string; close(): Promise<void> };
    const base = app.url;
    const token = (await (await fetch(base)).text()).match(/name="export-token" content="([^"]+)"/)![1];
    const post = (route: string, body: unknown) => fetch(`${base}/api/${route}`, { method: 'POST', headers: { 'X-Export-Token': token, Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal((await post('ios-settings', { settings: { identifier: 'nope' } })).status, 400);
    const saved = await post('ios-settings', { settings: { displayName: 'Pocket Flight' } });
    assert.equal(saved.status, 200);
    const profiles = JSON.parse(await readFile(path.join(root, 'export-profiles.json'), 'utf8'));
    assert.deepEqual(profiles['ios-development'].ios, { displayName: 'Pocket Flight' });
    assert.deepEqual(profiles['ios-release'].ios, { displayName: 'Pocket Flight' });
    assert.equal(profiles['android-development'].ios, undefined);

    // With a project present, settings update it in place and keep unrelated lines.
    const xcodeproj = path.join(root, 'src-tauri', 'gen', 'apple', 'game.xcodeproj');
    await mkdir(xcodeproj, { recursive: true });
    const pbx = '\t\t\tPRODUCT_BUNDLE_IDENTIFIER = com.old.game;\n\t\t\tPRODUCT_NAME = "Game";\n\t\t\tCURRENT_PROJECT_VERSION = 1;\n\t\t\tCODE_SIGN_STYLE = Automatic;\n';
    await writeFile(path.join(xcodeproj, 'project.pbxproj'), pbx);
    const updated = await post('ios-settings', { settings: { displayName: 'Pocket Flight', buildNumber: '7' } });
    assert.equal(updated.status, 200);
    const pbxNow = await readFile(path.join(xcodeproj, 'project.pbxproj'), 'utf8');
    assert.match(pbxNow, /PRODUCT_BUNDLE_IDENTIFIER = com\.studio\.game;/);
    assert.match(pbxNow, /PRODUCT_NAME = "Pocket Flight";/);
    assert.match(pbxNow, /CODE_SIGN_STYLE = Automatic;/, 'unrelated Xcode settings are kept');
    assert.match(pbxNow, /CURRENT_PROJECT_VERSION = 7/);
  } finally { await app?.close(); await rm(root, { recursive: true, force: true }); }
});

test('updating a project rewrites only the values Game Workshop owns, and regenerating keeps a backup', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workshop-update-'));
  try {
    const profile = { platform: 'ios', mode: 'development', name: 'Game', version: '2.0.0', identifier: 'com.studio.game', ios: { minimumVersion: '16.0' } };
    assert.equal(iosBuildSettings(profile).IPHONEOS_DEPLOYMENT_TARGET, '16.0');
    const dir = path.join(root, 'src-tauri', 'gen', 'apple');
    await mkdir(path.join(dir, 'g.xcodeproj'), { recursive: true });
    await writeFile(path.join(dir, 'g.xcodeproj', 'project.pbxproj'), '\tMARKETING_VERSION = 1.0.0;\n\tCUSTOM_FLAG = keep;\n');
    await writeFile(path.join(dir, 'project.yml'), 'settings:\n  PRODUCT_BUNDLE_IDENTIFIER: "com.old.app"\n  IPHONEOS_DEPLOYMENT_TARGET: 15.0\n');
    const result = await updateIosProject(root, profile);
    assert.deepEqual(result.changed.sort(), ['IPHONEOS_DEPLOYMENT_TARGET', 'MARKETING_VERSION', 'PRODUCT_BUNDLE_IDENTIFIER'].sort());
    assert.equal(await readFile(path.join(dir, 'g.xcodeproj', 'project.pbxproj'), 'utf8'), '\tMARKETING_VERSION = 2.0.0;\n\tCUSTOM_FLAG = keep;\n');
    const yml = await readFile(path.join(dir, 'project.yml'), 'utf8');
    assert.match(yml, /PRODUCT_BUNDLE_IDENTIFIER: "com\.studio\.game"/, 'quoted values stay quoted');
    assert.match(yml, /IPHONEOS_DEPLOYMENT_TARGET: 16\.0/);
    assert.ok(result.missing.includes('PRODUCT_NAME'), 'a key the project does not have is reported, not invented');

    const backup = await moveIosProjectAside(root, new Date('2026-11-04T02:00:00Z'));
    assert.equal(backup, 'apple.backup-2026-11-04T02-00-00');
    await access(path.join(root, 'src-tauri', 'gen', backup, 'project.yml'));
    await assert.rejects(access(dir));
    assert.equal(await moveIosProjectAside(root), undefined, 'nothing to move when there is no project');
  } finally { await rm(root, { recursive: true, force: true }); }
});
