import { assetKindOf, type AssetKind } from '../../scripts/editor-api-core.mjs';
import type { AudioFactory } from '../scene/index';

export { assetKindOf };
export type { AssetKind };

export interface AssetInfo {
  readonly path: string;
  readonly kind: AssetKind;
  readonly size: number;
}

/** Address of an asset file on the editor server. Each folder part is encoded separately. */
export function assetUrl(path: string): string {
  return `/__editor/asset/${path.split('/').map(encodeURIComponent).join('/')}`;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? `The editor server answered ${response.status}.`);
  }
  return (await response.json()) as T;
}

export async function listAssets(): Promise<AssetInfo[]> {
  return (await request<{ assets: AssetInfo[] }>('/__editor/assets')).assets;
}

export async function uploadAsset(path: string, file: Blob): Promise<AssetInfo> {
  return request<AssetInfo>(`/__editor/asset?path=${encodeURIComponent(path)}`, { method: 'POST', body: file });
}

export async function listScenes(): Promise<string[]> {
  return (await request<{ scenes: string[] }>('/__editor/scenes')).scenes;
}

export async function readScene(name: string): Promise<string> {
  const response = await fetch(`/__editor/scene/${encodeURIComponent(name)}`);
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? `Could not open ${name}.`);
  }
  return response.text();
}

export interface SavedScene {
  readonly name: string;
  readonly path: string;
  readonly downloadUrl: string;
}

export async function writeScene(name: string, text: string): Promise<SavedScene> {
  return request<SavedScene>(`/__editor/scene/${encodeURIComponent(name)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: text
  });
}

/** Caches images by asset path. Calls onLoad once each image is ready so the view can redraw. */
export class ImageCache {
  private readonly images = new Map<string, HTMLImageElement | 'failed'>();

  constructor(private readonly onLoad: () => void) {}

  /** The image if it has loaded; otherwise starts loading it and returns undefined. */
  get(path: string): HTMLImageElement | undefined {
    const known = this.images.get(path);
    if (known === 'failed') return undefined;
    if (known) return known.complete && known.naturalWidth > 0 ? known : undefined;
    const image = new Image();
    image.onload = () => this.onLoad();
    image.onerror = () => this.images.set(path, 'failed');
    image.src = assetUrl(path);
    this.images.set(path, image);
    return undefined;
  }

  /** Forgets an image so it is loaded again, for example after a re-import. */
  invalidate(path: string): void {
    this.images.delete(path);
  }
}

/** Plays audio from the assets folder through the browser. Errors go to onError, such as a blocked autoplay. */
export function createAudio(onError: (message: string) => void): AudioFactory {
  return (clip, options) => {
    const element = new Audio(assetUrl(clip));
    element.volume = Math.min(1, Math.max(0, options.volume));
    element.loop = options.loop;
    return {
      play() {
        return element.play().catch(error => onError(`Could not play ${clip}: ${String(error)}`));
      },
      stop() {
        element.pause();
        element.currentTime = 0;
      }
    };
  };
}
