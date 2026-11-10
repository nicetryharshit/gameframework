// The rotate gizmo: a ring around the selected entity. Dragging the ring turns the entity.

import type { Point } from '../picking';
import type { ViewPalette } from '../view';

export const RING = { radius: 58, grab: 6 } as const;

/** True when a screen point is on the ring. */
export function hitRing(origin: Point, point: Point): boolean {
  return Math.abs(Math.hypot(point.x - origin.x, point.y - origin.y) - RING.radius) <= RING.grab;
}

/** The direction from `origin` to `point` in degrees, counter-clockwise, in world space (y up). */
export function worldAngle(origin: Point, point: Point): number {
  return (Math.atan2(point.y - origin.y, point.x - origin.x) * 180) / Math.PI;
}

export function drawRing(ctx: CanvasRenderingContext2D, origin: Point, palette: ViewPalette, active: boolean) {
  ctx.save();
  ctx.strokeStyle = active ? palette.selected : palette.gizmoFree;
  ctx.globalAlpha = active ? 1 : 0.7;
  ctx.lineWidth = active ? 3 : 2;
  ctx.beginPath();
  ctx.arc(origin.x, origin.y, RING.radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
