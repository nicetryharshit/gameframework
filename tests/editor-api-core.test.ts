import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  assetKindOf,
  checkAssetPath,
  checkSceneText,
  EditorApiError,
  mimeFor,
  sceneFileName
} from '../scripts/editor-api-core.mjs';

function rejects(fn: () => unknown, status = 400) {
  assert.throws(fn, (error: unknown) => error instanceof EditorApiError && error.status === status);
}

test('scene names map to files and cannot escape the scenes folder', () => {
  assert.equal(sceneFileName('level-1'), 'level-1.scene.json');
  rejects(() => sceneFileName('../secrets'));
  rejects(() => sceneFileName('Level'));
  rejects(() => sceneFileName('a/b'));
  rejects(() => sceneFileName(''));
  rejects(() => sceneFileName(42 as unknown as string));
});

test('asset kinds come from the extension', () => {
  assert.equal(assetKindOf('images/ship.PNG'), 'image');
  assert.equal(assetKindOf('audio/beep.wav'), 'audio');
  assert.equal(assetKindOf('notes.txt'), null);
  assert.equal(mimeFor('ship.svg'), 'image/svg+xml');
  assert.equal(mimeFor('blob.bin'), 'application/octet-stream');
});

test('asset paths must sit in the matching folder', () => {
  assert.deepEqual(checkAssetPath('images/ship.png'), { kind: 'image', path: 'images/ship.png' });
  assert.deepEqual(checkAssetPath('audio/beep.wav'), { kind: 'audio', path: 'audio/beep.wav' });
  rejects(() => checkAssetPath('audio/ship.png'));
  rejects(() => checkAssetPath('images/beep.wav'));
  rejects(() => checkAssetPath('ship.png'));
});

test('asset paths cannot climb out of the assets folder', () => {
  rejects(() => checkAssetPath('images/../../package.json'));
  rejects(() => checkAssetPath('images/.hidden.png'));
  rejects(() => checkAssetPath('images/a b.png'));
  rejects(() => checkAssetPath(''));
  rejects(() => checkAssetPath('images/evil.exe'));
});

test('scene text must be JSON with the scene format', () => {
  checkSceneText(JSON.stringify({ format: 'gameframework.scene', version: 1, entities: [] }));
  rejects(() => checkSceneText('{not json'));
  rejects(() => checkSceneText(JSON.stringify({ format: 'other', entities: [] })));
  rejects(() => checkSceneText(JSON.stringify({ format: 'gameframework.scene', entities: {} })));
});

test('the demo scene shipped in scenes/ is a valid scene file', () => {
  const path = fileURLToPath(new URL('../scenes/demo.scene.json', import.meta.url));
  checkSceneText(readFileSync(path, 'utf8'));
});
