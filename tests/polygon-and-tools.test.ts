import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convexHull } from '../src/scene/hull';
import { checkValue } from '../src/scene/schema';
import { insidePolygon } from '../src/editor/picking';
import { insertPoint, removePoint } from '../src/editor/poly-edit';
import { hitRing, RING } from '../src/editor/gizmo/rotate';
import { hitScale } from '../src/editor/gizmo/scale';
import { moveGizmoAt } from '../src/editor/gizmo/geometry';

const square = [{ x: -1, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 1 }, { x: -1, y: 1 }];

test('the convex hull drops interior points and keeps the corners', () => {
  const hull = convexHull([...square, { x: 0, y: 0 }, { x: 0.5, y: 0.2 }]);
  assert.equal(hull.length, 4);
  assert.deepEqual(hull.map(p => [p.x, p.y]).sort(), square.map(p => [p.x, p.y]).sort());
});

test('collinear points have no area', () => {
  assert.ok(convexHull([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }]).length < 3);
});

test('a point is inside a polygon by the even-odd rule', () => {
  assert.equal(insidePolygon(square, { x: 0, y: 0 }), true);
  assert.equal(insidePolygon(square, { x: 2, y: 0 }), false);
  const concave = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 2, y: 1 }, { x: 0, y: 4 }];
  assert.equal(insidePolygon(concave, { x: 2, y: 3 }), false, 'the notch is outside');
});

test('corners can be added on an edge and removed, but never below three', () => {
  assert.equal(insertPoint(square, 1, { x: 0, y: -1 }).length, 5);
  assert.equal(removePoint(square, 0)?.length, 3);
  assert.equal(removePoint(square.slice(0, 3), 0), null);
});

test('colour and point fields are validated', () => {
  assert.equal(checkValue({ type: 'color', default: '#ffffff' }, '#00FF88'), null);
  assert.ok(checkValue({ type: 'color', default: '#ffffff' }, 'red'));
  assert.equal(checkValue({ type: 'points', default: [] }, [{ x: 1, y: 2 }]), null);
  assert.ok(checkValue({ type: 'points', default: [] }, [{ x: 'a', y: 2 }]));
});

test('the rotate ring and scale handles are hit where they are drawn', () => {
  const origin = { x: 100, y: 100 };
  assert.equal(hitRing(origin, { x: 100 + RING.radius, y: 100 }), true);
  assert.equal(hitRing(origin, { x: 100, y: 100 }), false);
  const layout = moveGizmoAt(origin);
  assert.equal(hitScale(layout, { x: 100 + 72, y: 100 }), 'x');
  assert.equal(hitScale(layout, { x: 100, y: 100 - 72 }), 'y');
  assert.equal(hitScale(layout, { x: 100, y: 100 }), 'free');
});
