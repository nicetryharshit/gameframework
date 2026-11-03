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

test('dashboard renders platform cards, opens details and starts a build from the local API', async () => {
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
    const cards = Array.from(doc.querySelectorAll('#cards .card'));
    assert.equal(cards.length, 6);
    const statusOf = (name: string) => cards.find(card => card.querySelector('h3')?.textContent === name)?.querySelector('.status')?.textContent;
    assert.equal(statusOf('Web'), 'Ready');
    assert.equal(statusOf('iPhone and iPad'), 'Needs a Mac computer');
    assert.equal(statusOf('Android'), 'Setup needed');
    assert.equal(doc.querySelectorAll('#addons .card').length, 1);

    const webBuild = cards.find(card => card.querySelector('h3')?.textContent === 'Web')!.querySelector('button') as HTMLButtonElement;
    webBuild.click();
    await settle();
    assert.deepEqual(posts.at(-1), { route: '/api/start', body: { profile: profiles['web-development'], action: 'dev' } });
    assert.equal((doc.querySelector('#panel') as HTMLElement).hidden, false);
    assert.equal(doc.querySelector('#panel-title')?.textContent, 'Web');
  } finally {
    Object.assign(globals, previous);
  }
});
