import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addEntity, emptyScene, getEntity, removeEntity, worldTransform, type Scene } from '../src/scene/index';
import { moveEntityBy, outlineOf, pickEntity, shapeOf } from '../src/editor/picking';
import { toScreen, toWorld, zoomAt } from '../src/editor/view';
import { checkpoint, commitScene, createEditorState, redo, replaceScene, selectEntity, undo } from '../src/editor/state';

function sample(): Scene {
  let scene = emptyScene();
  scene = addEntity(scene, { id: 'ship', components: { transform: { x: -2, y: 1, rotation: 20 }, collider: { shape: 'box', width: 2, height: 1 } } });
  scene = addEntity(scene, { id: 'gun', parent: 'ship', components: { transform: { x: 1.2, y: 0 }, collider: { shape: 'circle', radius: 0.25 } } });
  scene = addEntity(scene, { id: 'crate', components: { transform: { x: 3, y: -1 }, collider: { shape: 'box', width: 1.5, height: 1.5 } } });
  return scene;
}

/** A point given in an entity's local units, converted to world units. */
function localToWorld(scene: Scene, id: string, local: { x: number; y: number }) {
  const world = worldTransform(scene, id);
  const radians = (world.rotation * Math.PI) / 180;
  const sx = local.x * world.scaleX;
  const sy = local.y * world.scaleY;
  return { x: world.x + Math.cos(radians) * sx - Math.sin(radians) * sy, y: world.y + Math.sin(radians) * sx + Math.cos(radians) * sy };
}

const near = (actual: number, expected: number, message: string, tolerance = 1e-6) =>
  assert.ok(Math.abs(actual - expected) < tolerance, `${message}: expected ${expected}, got ${actual}`);

test('picking finds the entity under a point and misses empty space', () => {
  const scene = sample();
  assert.equal(pickEntity(scene, { x: 3, y: -1 }), 'crate');
  assert.equal(pickEntity(scene, { x: 10, y: 10 }), null);
  assert.equal(pickEntity(emptyScene(), { x: 0, y: 0 }), null);
});

test('picking follows the rotation of the shape', () => {
  const scene = sample();
  // The ship is a 2 by 1 box turned 20 degrees. Its local point (0, 0.45) is inside; (0, 0.6) is outside.
  assert.equal(pickEntity(scene, localToWorld(scene, 'ship', { x: 0, y: 0.45 })), 'ship');
  assert.equal(pickEntity(scene, localToWorld(scene, 'ship', { x: 0, y: 0.6 })), null);
});

test('a child is picked at its own position, even inside its parent', () => {
  const scene = sample();
  assert.equal(pickEntity(scene, localToWorld(scene, 'gun', { x: 0, y: 0 })), 'gun');
});

test('moving a child moves it by the requested world distance', () => {
  const scene = sample();
  const before = worldTransform(scene, 'gun');
  const moved = moveEntityBy(scene, 'gun', { x: 0.5, y: -0.25 });
  const after = worldTransform(moved, 'gun');
  near(after.x - before.x, 0.5, 'x moved', 0.002);
  near(after.y - before.y, -0.25, 'y moved', 0.002);
  near(after.rotation, before.rotation, 'rotation kept');
});

test('moving a root sets its position directly', () => {
  const moved = moveEntityBy(sample(), 'crate', { x: 1, y: 1 });
  const transform = getEntity(moved, 'crate').components.transform;
  assert.equal(transform.x, 4);
  assert.equal(transform.y, 0);
});

test('an entity under a zero-scale parent cannot be moved in the view', () => {
  let scene = emptyScene();
  scene = addEntity(scene, { id: 'flat', components: { transform: { scaleX: 0 } } });
  scene = addEntity(scene, { id: 'kid', parent: 'flat' });
  assert.throws(() => moveEntityBy(scene, 'kid', { x: 1, y: 0 }), /zero-scale parent/);
});

test('shapes: colliders decide the outline, and entities without one are a unit box', () => {
  const scene = sample();
  assert.deepEqual(shapeOf(getEntity(scene, 'crate')), { kind: 'box', width: 1.5, height: 1.5 });
  assert.deepEqual(shapeOf({ id: 'plain', parent: null, components: {} }), { kind: 'box', width: 1, height: 1 });
  const circle = outlineOf({ kind: 'circle', radius: 2 });
  assert.equal(circle.length, 32);
  near(circle[0].x, 2, 'first circle point x');
  near(circle[0].y, 0, 'first circle point y');
});

test('screen and world conversions are inverses', () => {
  const camera = { x: 1, y: 2, zoom: 50 };
  const size = { width: 800, height: 600 };
  const point = { x: 3, y: -1 };
  const back = toWorld(camera, size, toScreen(camera, size, point));
  near(back.x, point.x, 'x round trip');
  near(back.y, point.y, 'y round trip');
});

test('zooming keeps the point under the cursor where it was', () => {
  const camera = { x: 0, y: 0, zoom: 50 };
  const size = { width: 800, height: 600 };
  const cursor = { x: 620, y: 150 };
  const anchor = toWorld(camera, size, cursor);
  const zoomed = zoomAt(camera, size, cursor, 2);
  const after = toWorld(zoomed, size, cursor);
  near(after.x, anchor.x, 'anchor x');
  near(after.y, anchor.y, 'anchor y');
  near(zoomed.zoom, 100, 'zoom doubled');
});

test('a drag is one undo step, however many moves it has', () => {
  let state = createEditorState(sample());
  const original = state.scene;
  state = checkpoint(state);
  state = replaceScene(state, moveEntityBy(state.scene, 'crate', { x: 0.5, y: 0 }));
  state = replaceScene(state, moveEntityBy(state.scene, 'crate', { x: 0.5, y: 0 }));
  assert.equal(state.past.length, 1);
  state = undo(state);
  assert.equal(state.scene, original);
  state = redo(state);
  near(getEntity(state.scene, 'crate').components.transform.x as number, 4, 'redo restores the moved position');
});

test('undo and redo move through scenes and keep the selection only while it exists', () => {
  let state = createEditorState(sample());
  state = selectEntity(state, 'crate');
  state = commitScene(state, removeEntity(state.scene, 'crate'));
  assert.equal(state.selected, null);
  state = undo(state);
  assert.ok(state.scene.entities.some(entity => entity.id === 'crate'));
  assert.equal(undo(createEditorState()).scene.entities.length, 0);
});

test('committing the same scene does nothing', () => {
  const state = createEditorState(sample());
  assert.equal(commitScene(state, state.scene), state);
});
