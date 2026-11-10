// The scale gizmo: arrows that end in squares. Dragging an end stretches that axis; the centre square scales both.

import type { Point } from '../picking';
import type { ViewPalette } from '../view';
import type { Axis, MoveGizmoLayout } from './geometry';
import { MOVE_GIZMO } from './geometry';

const HANDLE = 9;

/** The handle under a screen point, or null. The centre square is uniform scale ("free"). */
export function hitScale(layout: MoveGizmoLayout, point: Point): Axis | null {
  const { origin, length } = layout;
  const half = HANDLE / 2 + MOVE_GIZMO.grab / 2;
  const near = (a: Point) => Math.abs(point.x - a.x) <= half && Math.abs(point.y - a.y) <= half;
  if (near(origin)) return 'free';
  if (near({ x: origin.x + length, y: origin.y })) return 'x';
  if (near({ x: origin.x, y: origin.y - length })) return 'y';
  return null;
}

export function drawScale(ctx: CanvasRenderingContext2D, layout: MoveGizmoLayout, palette: ViewPalette, active: Axis | null) {
  const { origin, length } = layout;
  const tips: Array<[Axis, Point, string]> = [
    ['x', { x: origin.x + length, y: origin.y }, palette.gizmoX],
    ['y', { x: origin.x, y: origin.y - length }, palette.gizmoY]
  ];
  ctx.save();
  for (const [axis, tip, color] of tips) {
    const strong = active === axis;
    ctx.strokeStyle = color;
    ctx.lineWidth = strong ? 3 : 2;
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(tip.x, tip.y);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fillRect(tip.x - HANDLE / 2, tip.y - HANDLE / 2, HANDLE, HANDLE);
  }
  ctx.globalAlpha = active === 'free' ? 1 : 0.85;
  ctx.fillStyle = palette.selected;
  ctx.fillRect(origin.x - HANDLE / 2, origin.y - HANDLE / 2, HANDLE, HANDLE);
  ctx.restore();
}
