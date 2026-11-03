import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPreferencesStore, defaultPreferences } from '../src/framework/settings';
import { GameLoop } from '../src/framework/loop';

test('preferences reject invalid display/audio values and round trip valid data', () => {
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } };
  const store = createPreferencesStore('game', storage);
  assert.equal(store.save('settings', { ...defaultPreferences }).ok, true);
  assert.deepEqual(store.load('settings'), { ok: true, value: defaultPreferences });
  assert.equal(store.save('settings', { ...defaultPreferences, master: NaN }).ok, false);
  data.set('game:settings', JSON.stringify({ version: 1, data: { ...defaultPreferences, windowSize: 'broken' } }));
  assert.equal(store.load('settings').ok, false);
});

test('frame limiter maintains 60 updates on a 144Hz display, and can be disabled', () => {
  const originalRequest = globalThis.requestAnimationFrame, originalCancel = globalThis.cancelAnimationFrame;
  let callback: FrameRequestCallback = () => {}; let updates = 0;
  globalThis.requestAnimationFrame = cb => { callback = cb; return 1; }; globalThis.cancelAnimationFrame = () => {};
  try {
    const loop = new GameLoop(() => { updates++; }); loop.setFrameLimit(60); loop.start();
    for (let i = 0; i < 144; i++) callback(i * 1000 / 144);
    assert.equal(updates, 60);
    loop.setFrameLimit(0); for (let i = 144; i < 288; i++) callback(i * 1000 / 144);
    assert.equal(updates, 204); loop.stop();
  } finally { globalThis.requestAnimationFrame = originalRequest; globalThis.cancelAnimationFrame = originalCancel; }
});
