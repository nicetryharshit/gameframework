import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
// @ts-expect-error Plain Node tooling module.
import { buildPlan, checkPlatform } from '../scripts/export-ui/builds.mjs';
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
    await writeFile(path.join(framework, 'scripts', 'create-game.mjs'), "export const frameworkVersion = async () => ({ version: '9.9.9', revision: 'abc123' });\nexport const inspectGame = async () => ({ version: '0.0.1', revision: 'old000', outdated: true, components: [] });\n");
    const listed = await (await fetch(`${base}/api/games`, { headers: { 'X-Export-Token': token } })).json();
    assert.deepEqual(listed.games.map((game: { folder: string; renderer: string; update: { outdated: boolean } }) => [game.folder, game.renderer, game.update.outdated]), [['sample-game', '3d', true]]);
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
