import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, access } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
// @ts-expect-error Plain Node tooling module.
import { buildPlan, validateProfile } from '../scripts/export-ui/builds.mjs';
// @ts-expect-error Plain Node tooling module.
import { startExportUI } from '../scripts/export-ui/server.mjs';

const profile = { platform: 'web', mode: 'development', name: 'Test game', version: '1.0.0', identifier: 'com.test.game' };
test('build profiles reject unsupported targets and unsafe options', () => {
  assert.throws(() => validateProfile({ ...profile, platform: 'arbitrary-command' }), /Invalid/);
  assert.throws(() => validateProfile({ ...profile, version: 'no' }), /version/);
  assert.throws(() => buildPlan(process.cwd(), { ...profile, platform: 'ios' }, 'build', 'win32'), /Mac/);
  assert.throws(() => buildPlan(process.cwd(), { ...profile, platform: 'android', mode: 'release' }, 'build'), /signing/);
  assert.throws(() => buildPlan(process.cwd(), profile, 'delete'), /Unknown/);
  const dev = buildPlan(process.cwd(), profile, 'dev');
  assert.equal(dev.length, 1); assert.ok(dev[0].args.includes('--strictPort'));
  assert.equal(dev[0].args.includes('build'), false); assert.equal(dev[0].args.includes('--noEmit'), false);
  assert.throws(() => buildPlan(process.cwd(), { ...profile, platform: 'windows' }, 'dev'), /only available for web/);
});

test('local export server authenticates, executes jobs, collects outputs and preserves prior builds', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'export-dashboard-'));
  let app: { url: string; close(): Promise<void> } | undefined;
  try {
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'fixture-game', version: '1.0.0' }));
    // Tiny subprocess fixtures exercise orchestration without invoking a compiler in every unit-test run.
    for (const [pkg, file, body] of [
      ['typescript', 'bin/tsc', 'process.exit(0)'],
      ['vite', 'bin/vite.js', "const fs=require('node:fs');fs.mkdirSync('dist',{recursive:true});fs.writeFileSync('dist/index.html','<h1>Fixture build</h1>');"]
    ]) {
      const directory = path.join(root, 'node_modules', pkg); await mkdir(path.join(directory, 'bin'), { recursive: true });
      await writeFile(path.join(directory, 'package.json'), JSON.stringify({ name: pkg })); await writeFile(path.join(directory, file), body);
    }
    app = await startExportUI(root, 0);
    const html = await (await fetch(app!.url)).text(); const token = html.match(/name="export-token" content="([^"]+)"/)![1];
    const request = (route: string, body?: unknown, origin = app!.url) => fetch(`${app!.url}/api/${route}`, { method: body === undefined ? 'GET' : 'POST', headers: { 'X-Export-Token': token, Origin: origin, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    assert.equal((await fetch(`${app!.url}/api/state`)).status, 403);
    assert.equal((await request('profile', profile, 'https://external.example')).status, 403);
    assert.equal((await request('profile', profile)).status, 200);
    assert.ok(JSON.parse(await readFile(path.join(root, 'export-profiles.json'), 'utf8'))['web-development']);
    const first = await (await request('start', { profile, action: 'build' })).json() as { id: string };
    assert.equal((await request('start', { profile, action: 'build' })).status, 409);
    const end = Date.now() + 15000;
    let job: { status: string; output?: { directory: string; artifacts: unknown[] }; log: string } | undefined;
    while (Date.now() < end) {
      const state = await (await request('state')).json() as { jobs: typeof job[] };
      job = state.jobs[0]; if (job?.status !== 'running') break;
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    assert.equal(job?.status, 'succeeded', job?.log);
    assert.match(await readFile(path.join(root, job!.output!.directory, 'web/index.html'), 'utf8'), /Fixture build/);
    assert.match(await (await fetch(`${app!.url}/preview/${first.id}/`)).text(), /Fixture build/);
    await access(path.join(root, job!.output!.directory, 'build-report.json'));
    assert.equal((await request('start', { profile: { ...profile, platform: 'unknown' }, action: 'build' })).status, 400);
    assert.ok((await (await request('state')).json()).jobs[0].output);
    await writeFile(path.join(root, 'node_modules/vite/bin/vite.js'), "console.log('Local: http://127.0.0.1:5173/');setInterval(()=>{},1000)");
    await request('start', { profile, action: 'dev' });
    const runningDeadline = Date.now() + 10000;
    while (Date.now() < runningDeadline) {
      const running = (await (await request('state')).json()).jobs.at(-1);
      if (running.devUrl) {
        assert.equal(running.devUrl, 'http://127.0.0.1:5173/'); assert.equal(running.output, undefined);
        assert.equal(running.log.includes('Check TypeScript'), false); assert.equal(running.log.includes('Build web assets'), false);
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    await request('stop', {});
    let cancelled;
    const cancelDeadline = Date.now() + 10000;
    do {
      cancelled = (await (await request('state')).json()).jobs.at(-1);
      if (cancelled.status !== 'running') break;
      await new Promise(resolve => setTimeout(resolve, 30));
    } while (Date.now() < cancelDeadline);
    assert.equal(cancelled.status, 'cancelled');
    assert.equal(cancelled.devUrl, 'http://127.0.0.1:5173/'); assert.equal(cancelled.output, undefined);
    await access(path.join(root, job!.output!.directory, 'web/index.html'));
  } finally { await app?.close(); await rm(root, { recursive: true, force: true }); }
});
