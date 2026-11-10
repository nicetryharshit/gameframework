import { test } from 'node:test';
import assert from 'node:assert/strict';
import { constrainDelta, hitAxis, moveGizmoAt, distanceToSegment, MOVE_GIZMO } from '../src/editor/gizmo/geometry';

const layout = moveGizmoAt({ x: 100, y: 200 });

test('the centre square hits the free handle', () => {
  assert.equal(hitAxis(layout, { x: 100, y: 200 }), 'free');
  assert.equal(hitAxis(layout, { x: 104, y: 196 }), 'free');
});

test('the x arrow points right and the y arrow points up on screen', () => {
  assert.equal(hitAxis(layout, { x: 100 + MOVE_GIZMO.length / 2, y: 200 }), 'x');
  assert.equal(hitAxis(layout, { x: 100, y: 200 - MOVE_GIZMO.length / 2 }), 'y');
  assert.equal(hitAxis(layout, { x: 100, y: 200 + MOVE_GIZMO.length / 2 }), null);
});

test('empty space misses every handle', () => {
  assert.equal(hitAxis(layout, { x: 300, y: 50 }), null);
});

test('distance to a segment is measured to the nearest point on it', () => {
  assert.equal(distanceToSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 }), 3);
  assert.equal(distanceToSegment({ x: 13, y: 4 }, { x: 0, y: 0 }, { x: 10, y: 0 }), 5);
  assert.equal(distanceToSegment({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 }), 5);
});

test('constraining keeps only the chosen axis', () => {
  assert.deepEqual(constrainDelta('x', { x: 2, y: 3 }), { x: 2, y: 0 });
  assert.deepEqual(constrainDelta('y', { x: 2, y: 3 }), { x: 0, y: 3 });
  assert.deepEqual(constrainDelta('free', { x: 2, y: 3 }), { x: 2, y: 3 });
});
