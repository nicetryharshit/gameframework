import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
// @ts-expect-error Plain Node tooling module.
import { buildPlan } from '../scripts/export-ui/builds.mjs';
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
  } finally { await app?.close(); await rm(root, { recursive: true, force: true }); }
});
