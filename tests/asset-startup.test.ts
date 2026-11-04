import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
// @ts-expect-error Generator is a plain Node module.
import { createGame } from '../scripts/create-game.mjs';
import type * as Loader from '../src/framework/assets';

// These tests run the loader copy inside a freshly generated game, with the default fetch and decode path
// and the network stubbed. The browser UI of the example is not covered here.

const realFetch = globalThis.fetch;
const realCreateImageBitmap = globalThis.createImageBitmap;
const fakeAudio = { decodeAudioData: async (data: ArrayBuffer) => ({ bytes: data.byteLength }) as unknown as AudioBuffer };

async function withGame(task: (loader: typeof Loader) => Promise<void>) {
  const games = await mkdtemp(path.join(tmpdir(), 'webgame-startup-'));
  try {
    const dir = path.join(games, 'game');
    await createGame(dir, 'canvas');
    const loader = await import(pathToFileURL(path.join(dir, 'tools/gameframework/src/framework/assets.ts')).href) as typeof Loader;
    await task(loader);
  } finally {
    await rm(games, { recursive: true, force: true });
  }
}

/** Replaces fetch for one test. Returns the function that puts the real one back. */
function stubNetwork(handler: (url: string, signal: AbortSignal | undefined) => Promise<Response>) {
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => handler(String(input), init?.signal ?? undefined)) as typeof fetch;
  globalThis.createImageBitmap = (async () => ({ width: 2, height: 2, close() {} })) as unknown as typeof createImageBitmap;
  return () => {
    globalThis.fetch = realFetch;
    globalThis.createImageBitmap = realCreateImageBitmap;
  };
}

test('a missing file in a generated game fails by name and url, and the other files are not returned', () => withGame(async loader => {
  const restore = stubNetwork(async url => url.endsWith('missing.png')
    ? new Response('not found', { status: 404 })
    : new Response(new Blob(['bytes'])));
  try {
    await assert.rejects(loader.loadAssets({
      hero: { kind: 'image', url: 'hero.png' },
      gone: { kind: 'image', url: 'missing.png' },
      jump: { kind: 'sound', url: 'jump.wav' },
    } as const, { audio: fakeAudio }), (error: unknown) => {
      assert.ok(error instanceof loader.AssetLoadError);
      assert.deepEqual(error.failures, [{ name: 'gone', url: 'missing.png', reason: 'HTTP 404' }]);
      assert.match(error.message, /gone \(missing\.png: HTTP 404\)/);
      return true;
    });
  } finally {
    restore();
  }
}));

test('a file that loads fine in a generated game is returned by name', () => withGame(async loader => {
  const restore = stubNetwork(async () => new Response(new Blob(['bytes'])));
  try {
    const assets = await loader.loadAssets({
      hero: { kind: 'image', url: 'hero.png' },
      jump: { kind: 'sound', url: 'jump.wav' },
    } as const, { audio: fakeAudio });
    assert.equal(assets.image('hero').width, 2);
    assert.equal((assets.sound('jump') as unknown as { bytes: number }).bytes > 0, true);
    assets.dispose();
  } finally {
    restore();
  }
}));

test('cancelling during startup stops the slow file and returns nothing', () => withGame(async loader => {
  let stopped = false;
  const restore = stubNetwork((_url, signal) => new Promise<Response>((_, reject) => {
    signal?.addEventListener('abort', () => { stopped = true; reject(new Error('aborted')); }, { once: true });
  }));
  try {
    const controller = new AbortController();
    const pending = loader.loadAssets({ slow: { kind: 'image', url: 'slow.png' } } as const, { signal: controller.signal });
    await new Promise(resolve => setTimeout(resolve, 10));
    controller.abort();
    await assert.rejects(pending, loader.AssetLoadCancelled);
    assert.equal(stopped, true);
  } finally {
    restore();
  }
}));

test('a load that starts already cancelled never fetches anything', () => withGame(async loader => {
  let fetched = 0;
  const restore = stubNetwork(async () => { fetched++; return new Response(new Blob(['bytes'])); });
  try {
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(loader.loadAssets({ hero: { kind: 'image', url: 'hero.png' } } as const, { signal: controller.signal }), loader.AssetLoadCancelled);
    assert.equal(fetched, 0);
  } finally {
    restore();
  }
}));
