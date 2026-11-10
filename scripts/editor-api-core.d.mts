export class EditorApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string);
}
export const MAX_SCENE_BYTES: number;
export const MAX_ASSET_BYTES: number;
export type AssetKind = 'image' | 'audio';
export function sceneFileName(name: string): string;
export function extensionOf(file: string): string;
export function assetKindOf(file: string): AssetKind | null;
export function mimeFor(file: string): string;
export function checkAssetPath(relativePath: string): { kind: AssetKind; path: string };
export function checkSceneText(text: string): void;
