import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addEntity, duplicateEntity, emptyScene, getEntity, renameEntity, type Scene } from '../src/scene/index';
import { localDeltaFor, setPosition } from '../src/editor/picking';
import { checkpoint, commitScene, createEditorState, isDirty, markSaved, replaceScene, undo } from '../src/editor/state';

function sample(): Scene {
  let scene = emptyScene();
  scene = addEntity(scene, { id: 'ship', components: { transform: { x: -2, y: 1 } } });
  scene = addEntity(scene, { id: 'gun', parent: 'ship', components: { transform: { x: 1.2, y: 0 } } });
  scene = addEntity(scene, { id: 'crate', components: { transform: { x: 3, y: -1 } } });
  return scene;
}

test('renaming an entity updates the children that point at it', () => {
  const renamed = renameEntity(sample(), 'ship', 'hull');
  assert.equal(getEntity(renamed, 'gun').parent, 'hull');
  assert.throws(() => getEntity(renamed, 'ship'), /No entity with id "ship"/);
});

test('renaming refuses empty names and names already in use', () => {
  assert.throws(() => renameEntity(sample(), 'ship', ''), /needs an id/);
  assert.throws(() => renameEntity(sample(), 'ship', 'crate'), /already exists/);
  const scene = sample();
  assert.equal(renameEntity(scene, 'ship', 'ship'), scene);
});

test('duplicating copies one entity beside the original, under the same parent, without its children', () => {
  const copied = duplicateEntity(sample(), 'gun', 'gun-2');
  assert.equal(copied.entities.length, 4);
  const copy = getEntity(copied, 'gun-2');
  assert.equal(copy.parent, 'ship');
  assert.equal(copy.components.transform.x, 1.7);
  assert.equal(getEntity(copied, 'gun').components.transform.x, 1.2);
});

test('with snapping, positions land on the grid', () => {
  const placed = setPosition(sample(), 'crate', { x: 1.2, y: -0.9 }, undefined, 0.25);
  assert.equal(getEntity(placed, 'crate').components.transform.x, 1.25);
  assert.equal(getEntity(placed, 'crate').components.transform.y, -1);
});

test('a snapped drag keeps adding up small moves instead of getting stuck', () => {
  const scene = sample();
  const start = 3;
  // Each pointer event moves the crate by a small amount. The position is computed from the unsnapped start,
  // so the crate reaches the next grid point once enough movement has built up.
  const at = (totalMovement: number) => {
    const delta = localDeltaFor(scene, 'crate', { x: totalMovement, y: 0 });
    return getEntity(setPosition(scene, 'crate', { x: start + delta.x, y: -1 }, undefined, 0.25), 'crate').components.transform.x;
  };
  assert.equal(at(0.1), 3);
  assert.equal(at(0.2), 3.25);
});

test('the editor is dirty after a change, clean after saving, and clean again when undo returns to the saved scene', () => {
  let state = createEditorState(sample());
  assert.equal(isDirty(state), false);
  state = commitScene(state, renameEntity(state.scene, 'crate', 'box'));
  assert.equal(isDirty(state), true);
  state = markSaved(state);
  assert.equal(isDirty(state), false);
  state = commitScene(state, renameEntity(state.scene, 'box', 'case'));
  assert.equal(isDirty(state), true);
  state = undo(state);
  assert.equal(isDirty(state), false);
});

test('a gesture recorded with checkpoint can be undone in one step', () => {
  let state = createEditorState(sample());
  const original = state.scene;
  state = checkpoint(state);
  state = replaceScene(state, setPosition(state.scene, 'crate', { x: 5, y: 5 }));
  state = undo(state);
  assert.equal(state.scene, original);
});
