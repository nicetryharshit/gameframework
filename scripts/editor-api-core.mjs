/** Rules shared by the editor's dev-server endpoint and the editor page. Pure functions, so they are easy to test. */

export class EditorApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const MAX_SCENE_BYTES = 8 * 1024 * 1024;
export const MAX_ASSET_BYTES = 25 * 1024 * 1024;

const SCENE_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const KIND_BY_EXTENSION = {
  png: 'image', jpg: 'image', jpeg: 'image', webp: 'image', gif: 'image', svg: 'image',
  ogg: 'audio', mp3: 'audio', wav: 'audio'
};
const MIME_BY_EXTENSION = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml',
  ogg: 'audio/ogg', mp3: 'audio/mpeg', wav: 'audio/wav'
};

/** "level-1" becomes "level-1.scene.json". Anything else is refused, so names cannot escape the scenes folder. */
export function sceneFileName(name) {
  if (typeof name !== 'string' || !SCENE_NAME.test(name)) {
    throw new EditorApiError(400, 'Scene names use lowercase letters, numbers and dashes.');
  }
  return `${name}.scene.json`;
}

export function extensionOf(file) {
  const dot = file.lastIndexOf('.');
  return dot < 0 ? '' : file.slice(dot + 1).toLowerCase();
}

export function assetKindOf(file) {
  return KIND_BY_EXTENSION[extensionOf(file)] ?? null;
}

export function mimeFor(file) {
  return MIME_BY_EXTENSION[extensionOf(file)] ?? 'application/octet-stream';
}

/** Checks a path relative to assets/. Images go in images/, audio in audio/, and no segment can climb out. */
export function checkAssetPath(relativePath) {
  if (typeof relativePath !== 'string' || relativePath === '') {
    throw new EditorApiError(400, 'Choose a path inside the assets folder.');
  }
  const segments = relativePath.split('/');
  if (segments.some(segment => !SEGMENT.test(segment))) {
    throw new EditorApiError(400, `"${relativePath}" has a name that is not allowed. Use letters, numbers, dots, dashes and underscores.`);
  }
  const kind = assetKindOf(relativePath);
  if (!kind) {
    throw new EditorApiError(400, 'Only png, jpg, jpeg, webp, gif, svg, ogg, mp3 and wav files can be imported.');
  }
  const folder = kind === 'image' ? 'images' : 'audio';
  if (segments[0] !== folder) {
    throw new EditorApiError(400, `${kind} files go in assets/${folder}/.`);
  }
  return { kind, path: relativePath };
}

/** Checks that text is a scene file this framework can read. */
export function checkSceneText(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new EditorApiError(400, 'The scene is not valid JSON.');
  }
  if (!data || typeof data !== 'object' || data.format !== 'gameframework.scene' || !Array.isArray(data.entities)) {
    throw new EditorApiError(400, 'That is not a gameframework scene file.');
  }
}
