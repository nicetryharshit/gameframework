import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AssetLoadCancelled, AssetLoadError, loadAssets, type AssetManifest, type ImageSource } from '../src/framework/assets';

class FakeImage {
  closed = false;
  constructor(readonly width: number, readonly height: number) {}
  close() { this.closed = true; }
}

const fakeSound = (url: string) => ({ url } as unknown as AudioBuffer);

const loaders = {
  image: async (url: string): Promise<ImageSource> => new FakeImage(url.length, 4),
  sound: async (url: string) => fakeSound(url),
};

test('loads images and sounds, reports progress, and looks them up by name', async () => {
  const progress: string[] = [];
  const assets = await loadAssets({
    hero: { kind: 'image', url: 'hero.png' },
    jump: { kind: 'sound', url: 'jump.ogg' },
  } as const, { loaders, onProgress: item => progress.push(`${item.loaded}/${item.total}`) });
  assert.equal(assets.image('hero').width, 'hero.png'.length);
  assert.equal((assets.sound('jump') as unknown as { url: string }).url, 'jump.ogg');
  assert.deepEqual(assets.names, ['hero', 'jump']);
  assert.deepEqual(progress, ['0/2', '1/2', '2/2']);
});

test('an empty manifest is ready at once', async () => {
  const progress: string[] = [];
  const assets = await loadAssets({}, { loaders, onProgress: item => progress.push(`${item.loaded}/${item.total}`) });
  assert.deepEqual(assets.names, []);
  assert.deepEqual(progress, ['0/0']);
});

test('looking up a missing name, or a name of the other kind, throws with the name', async () => {
  const assets = await loadAssets({ hero: { kind: 'image', url: 'hero.png' }, jump: { kind: 'sound', url: 'jump.ogg' } } as const, { loaders });
  assert.throws(() => assets.image('nope' as never), /Unknown image asset: nope/);
  assert.throws(() => assets.image('jump' as never), /Unknown image asset: jump/);
  assert.throws(() => assets.sound('hero' as never), /Unknown sound asset: hero/);
});

test('a failed file rejects with its name and url, and stops the files still loading', async () => {
  let stopped = false;
  await assert.rejects(loadAssets({
    bad: { kind: 'image', url: 'missing.png' },
    slow: { kind: 'image', url: 'slow.png' },
  }, {
    loaders: {
      image: (url, signal): Promise<ImageSource> => url === 'missing.png'
        ? Promise.reject(new Error('HTTP 404'))
        : new Promise<ImageSource>((_, reject) => signal.addEventListener('abort', () => { stopped = true; reject(new Error('aborted')); }, { once: true })),
    },
  }), (error: unknown) => {
    assert.ok(error instanceof AssetLoadError);
    assert.deepEqual(error.failures, [{ name: 'bad', url: 'missing.png', reason: 'HTTP 404' }]);
    return true;
  });
  assert.equal(stopped, true);
});

test('cancelling stops loading and rejects with AssetLoadCancelled', async () => {
  const controller = new AbortController();
  const pending = loadAssets({ slow: { kind: 'image', url: 'slow.png' } }, {
    signal: controller.signal,
    loaders: { image: (_url, signal) => new Promise<ImageSource>((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })) },
  });
  controller.abort();
  await assert.rejects(pending, AssetLoadCancelled);
});

test('a manifest entry with an unknown kind is rejected before any file loads', async () => {
  let called = false;
  await assert.rejects(
    loadAssets({ oops: { kind: 'video', url: 'x.mp4' } } as unknown as AssetManifest, {
      loaders: { image: async () => { called = true; return new FakeImage(1, 1); } },
    }),
    /must be an image or a sound/,
  );
  assert.equal(called, false);
});

test('sound files need an audio context unless a sound loader is given', async () => {
  await assert.rejects(loadAssets({ jump: { kind: 'sound', url: 'jump.ogg' } }, {}), /Sound files need an audio context/);
});

test('dispose releases images and blocks further lookups', async () => {
  const image = new FakeImage(2, 2);
  const assets = await loadAssets({ hero: { kind: 'image', url: 'hero.png' } }, { loaders: { image: async () => image } });
  assets.dispose();
  assert.equal(image.closed, true);
  assert.throws(() => assets.image('hero'), /disposed/);
});
