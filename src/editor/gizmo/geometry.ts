// Screen-space geometry for the move gizmo. Pure functions, so they are easy to test.
// Screen y grows downwards; world y grows upwards. Arrows are measured in screen pixels.

import type { Point } from '../picking';

/** Which handle of the gizmo: the x arrow, the y arrow, or the square in the middle (free move). */
export type Axis = 'x' | 'y' | 'free';

export interface MoveGizmoLayout {
  /** The selected entity on screen, in CSS pixels. */
  readonly origin: Point;
  /** Arrow length in screen pixels. Fixed on screen, so it reads the same at any zoom. */
  readonly length: number;
  /** Side of the centre square in screen pixels. */
  readonly square: number;
}

/** Sizes in screen pixels. `grab` is how far from a handle the pointer may be and still hit it. */
export const MOVE_GIZMO = { length: 72, square: 12, grab: 6 } as const;

export function moveGizmoAt(origin: Point): MoveGizmoLayout {
  return { origin, length: MOVE_GIZMO.length, square: MOVE_GIZMO.square };
}

/** Distance from a point to a line segment. */
export function distanceToSegment(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}

/** The handle under a screen point, or null. The centre square is checked first so it wins where they meet. */
export function hitAxis(layout: MoveGizmoLayout, point: Point): Axis | null {
  const { origin, length, square } = layout;
  const half = square / 2 + MOVE_GIZMO.grab;
  if (Math.abs(point.x - origin.x) <= half && Math.abs(point.y - origin.y) <= half) return 'free';
  const xTip = { x: origin.x + length, y: origin.y };
  const yTip = { x: origin.x, y: origin.y - length };
  if (distanceToSegment(point, origin, xTip) <= MOVE_GIZMO.grab) return 'x';
  if (distanceToSegment(point, origin, yTip) <= MOVE_GIZMO.grab) return 'y';
  return null;
}

/** Keep only the movement along the chosen handle. Works in world units, before any parent transform is applied. */
export function constrainDelta(axis: Axis, delta: Point): Point {
  if (axis === 'x') return { x: delta.x, y: 0 };
  if (axis === 'y') return { x: 0, y: delta.y };
  return delta;
}
