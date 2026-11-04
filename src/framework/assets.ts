/**
 * Loads a game's images and sounds before it starts. A game lists each file once in a manifest, waits for
 * loadAssets to finish (watching onProgress), then looks files up by name. Declare the manifest `as const`
 * and a misspelled name is a compile error; the lookups also throw at runtime for anything else.
 */

export type AssetKind = 'image' | 'sound';
export interface AssetEntry { readonly kind: AssetKind; readonly url: string }
export type AssetManifest = Record<string, AssetEntry>;

/** Anything drawable with a size. ImageBitmap and HTMLImageElement both fit. */
export interface ImageSource { readonly width: number; readonly height: number; close?(): void }

export interface AssetProgress { loaded: number; total: number; name: string }
export interface AssetFailure { name: string; url: string; reason: string }

export interface AssetLoaders {
  image(url: string, signal: AbortSignal): Promise<ImageSource>;
  sound(url: string, signal: AbortSignal): Promise<AudioBuffer>;
}

export interface LoadAssetsOptions {
  onProgress?: (progress: AssetProgress) => void;
  /** Cancels loading. Files that already finished are released, and loadAssets rejects with AssetLoadCancelled. */
  signal?: AbortSignal;
  /** Decodes sound files with the default sound loader. Any AudioContext works. */
  audio?: { decodeAudioData(data: ArrayBuffer): Promise<AudioBuffer> };
  /** Replaces how a kind of file is fetched, for example in tests or a custom host. */
  loaders?: Partial<AssetLoaders>;
}

type NamesOfKind<M extends AssetManifest, K extends AssetKind> = { [N in keyof M]: M[N] extends { readonly kind: K } ? N : never }[keyof M] & string;

export interface Assets<M extends AssetManifest> {
  image(name: NamesOfKind<M, 'image'>): ImageSource;
  sound(name: NamesOfKind<M, 'sound'>): AudioBuffer;
  readonly names: readonly (keyof M & string)[];
  /** Releases the images and forgets everything. Lookups after this throw. */
  dispose(): void;
}

/** Some files failed. Loading stopped at the first failure, so `failures` holds the files that actually failed. */
export class AssetLoadError extends Error {
  constructor(readonly failures: AssetFailure[]) {
    super(`Could not load ${failures.length} asset${failures.length === 1 ? '' : 's'}: ${failures.map(item => `${item.name} (${item.url}: ${item.reason})`).join('; ')}`);
    this.name = 'AssetLoadError';
  }
}

export class AssetLoadCancelled extends Error {
  constructor() {
    super('Asset loading was cancelled');
    this.name = 'AssetLoadCancelled';
  }
}

function validate(manifest: AssetManifest) {
  for (const [name, entry] of Object.entries(manifest)) {
    if (entry.kind !== 'image' && entry.kind !== 'sound') throw new Error(`Asset ${name} must be an image or a sound`);
    if (typeof entry.url !== 'string' || !entry.url) throw new Error(`Asset ${name} needs a url`);
  }
}

async function fetchBytes(url: string, signal: AbortSignal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response;
}

const defaultImage = async (url: string, signal: AbortSignal): Promise<ImageSource> => createImageBitmap(await (await fetchBytes(url, signal)).blob());

function defaultSound(audio: NonNullable<LoadAssetsOptions['audio']>) {
  return async (url: string, signal: AbortSignal): Promise<AudioBuffer> => audio.decodeAudioData(await (await fetchBytes(url, signal)).arrayBuffer());
}

function closeAll(values: Iterable<unknown>) {
  for (const value of values) (value as { close?: () => void } | null)?.close?.();
}

/** Loads every file in the manifest. Resolves once all are ready, or rejects with what failed. */
export async function loadAssets<M extends AssetManifest>(manifest: M, options: LoadAssetsOptions = {}): Promise<Assets<M>> {
  validate(manifest);
  const { onProgress, signal, audio } = options;
  if (signal?.aborted) throw new AssetLoadCancelled();
  const entries = Object.entries(manifest);
  const image = options.loaders?.image ?? defaultImage;
  const sound = options.loaders?.sound ?? (audio ? defaultSound(audio) : undefined);
  if (entries.some(([, entry]) => entry.kind === 'sound') && !sound) throw new Error('Sound files need an audio context: pass audio to loadAssets.');

  // The first failure, or the caller's cancel, stops the files still in flight.
  const controller = new AbortController();
  const stop = () => controller.abort();
  signal?.addEventListener('abort', stop, { once: true });
  const failures: AssetFailure[] = [];
  const loaded = new Map<string, unknown>();
  let done = 0;
  onProgress?.({ loaded: 0, total: entries.length, name: '' });
  try {
    await Promise.allSettled(entries.map(async ([name, entry]) => {
      try {
        const value = entry.kind === 'image' ? await image(entry.url, controller.signal) : await sound!(entry.url, controller.signal);
        if (controller.signal.aborted) { closeAll([value]); return; }
        loaded.set(name, value);
        done++;
        onProgress?.({ loaded: done, total: entries.length, name });
      } catch (error) {
        // Errors caused by the stop above are not separate failures.
        if (!controller.signal.aborted) {
          failures.push({ name, url: entry.url, reason: error instanceof Error ? error.message : String(error) });
          controller.abort();
        }
      }
    }));
  } finally {
    signal?.removeEventListener('abort', stop);
  }
  if (signal?.aborted) { closeAll(loaded.values()); throw new AssetLoadCancelled(); }
  if (failures.length) { closeAll(loaded.values()); throw new AssetLoadError(failures); }

  const images = new Map<string, ImageSource>();
  const sounds = new Map<string, AudioBuffer>();
  for (const [name, entry] of entries) {
    if (entry.kind === 'image') images.set(name, loaded.get(name) as ImageSource);
    else sounds.set(name, loaded.get(name) as AudioBuffer);
  }
  let disposed = false;
  const lookup = <T>(map: Map<string, T>, kind: AssetKind, name: string): T => {
    if (disposed) throw new Error('Assets were disposed');
    const value = map.get(name);
    if (!value) throw new Error(`Unknown ${kind} asset: ${name}`);
    return value;
  };
  return {
    names: entries.map(([name]) => name) as (keyof M & string)[],
    image: name => lookup(images, 'image', name),
    sound: name => lookup(sounds, 'sound', name),
    dispose() {
      if (disposed) return;
      disposed = true;
      closeAll(images.values());
      images.clear();
      sounds.clear();
    },
  };
}
