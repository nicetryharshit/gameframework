import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Window } from 'happy-dom';

const checkResults: Record<string, { ready: boolean; checks: { name: string; ok: boolean; detail: string; blocking: boolean }[] }> = {
  web: { ready: true, checks: [{ name: 'TypeScript', ok: true, detail: 'Installed', blocking: true }] },
  ios: { ready: false, checks: [{ name: 'Build host', ok: false, detail: 'Current machine: Linux · required: macOS', blocking: true }] },
  android: { ready: false, checks: [{ name: 'Android SDK', ok: false, detail: 'Set ANDROID_HOME', blocking: true }, { name: 'Native project', ok: false, detail: 'Initialize once', blocking: false }] },
  steam: { ready: false, checks: [{ name: 'Steamworks SDK', ok: false, detail: 'Download the SDK', blocking: true }] }
};
const platforms = ['web', 'windows', 'macos', 'linux', 'ios', 'android'];
const profiles = Object.fromEntries(platforms.flatMap(platform => ['development', 'release'].map(mode => [`${platform}-${mode}`, { platform, mode, name: 'Test game', version: '1.0.0', identifier: 'com.test.game' }])));

test('dashboard renders the platform table, opens a full page and starts a build from the local API', async () => {
  const dir = path.join(process.cwd(), 'scripts', 'export-ui');
  const html = (await readFile(path.join(dir, 'index.html'), 'utf8')).replace('__EXPORT_TOKEN__', 'test-token');
  const window = new Window({ url: 'http://127.0.0.1:4179/' });
  window.document.write(html);
  const posts: { route: string; body: unknown }[] = [];
  const fetchStub = async (url: string, options: { method?: string; body?: string } = {}) => {
    const route = new URL(url, 'http://127.0.0.1:4179').pathname;
    const body = options.body ? JSON.parse(options.body) : undefined;
    if (options.method === 'POST') posts.push({ route, body });
    const data = route === '/api/state' ? { project: { name: 'Test game', root: '/game', host: 'linux', profiles }, jobs: [] }
      : route === '/api/check' ? checkResults[(body as { platform: string }).platform] ?? { ready: false, checks: [] }
      : route === '/api/start' ? { id: 'job-1' }
      : {};
    return { ok: true, status: 200, json: async () => data };
  };
  const globals = globalThis as Record<string, unknown>;
  const previous = { document: globals.document, fetch: globals.fetch, setInterval: globals.setInterval };
  Object.assign(globals, { document: window.document, fetch: fetchStub, setInterval: () => 0 });
  try {
    await import(pathToFileURL(path.join(dir, 'app.js')).href + '?test');
    const settle = () => new Promise(resolve => setTimeout(resolve, 30));
    await settle();
    const doc = window.document as unknown as Document;
    const rows = Array.from(doc.querySelectorAll('#view tbody tr'));
    assert.equal(rows.length, 7, 'six platforms plus the Steam add-on');
    const rowOf = (name: string) => rows.find(row => row.querySelector('b')?.textContent === name)!;
    const statusOf = (name: string) => rowOf(name).querySelectorAll('td')[1].textContent;
    assert.equal(statusOf('Web'), 'Ready');
    assert.equal(statusOf('iOS'), 'Needs macOS');
    assert.equal(statusOf('Android'), 'Needs setup');
    assert.equal(statusOf('Steam'), 'Not installed');
    assert.equal(doc.querySelectorAll('#side .nav').length, 8, 'overview, six platforms, steam');
    assert.equal(doc.querySelector('aside.panel'), null, 'no side panel');

    (rowOf('Web').querySelector('button') as HTMLButtonElement).click();
    await settle();
    assert.deepEqual(posts.at(-1), { route: '/api/start', body: { profile: profiles['web-development'], action: 'dev' } });
    assert.equal(doc.querySelector('#view h1')?.textContent, 'Web');
    assert.ok(doc.querySelector('#view .log'), 'platform page shows output');
    const clearLink = Array.from(doc.querySelectorAll('#view button')).find(node => node.textContent === 'Clear') as HTMLButtonElement;
    assert.ok(clearLink, 'output panel has a Clear action');
    assert.equal(clearLink.disabled, false, 'Clear is available when no job is running');

    (doc.querySelector('.crumb button') as HTMLButtonElement).click();
    await settle();
    assert.equal(doc.querySelector('#view h1')?.textContent, 'Test game');
  } finally {
    Object.assign(globals, previous);
  }
});
