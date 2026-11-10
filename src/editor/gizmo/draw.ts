// Draws the move gizmo on the editor canvas. Colours come from the view palette, so themes control them.

import type { ViewPalette } from '../view';
import type { Axis, MoveGizmoLayout } from './geometry';

const ARROW_HEAD = 9;

function drawArrow(ctx: CanvasRenderingContext2D, from: { x: number; y: number }, to: { x: number; y: number }, color: string, strong: boolean) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = strong ? 3 : 2;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - ARROW_HEAD * Math.cos(angle - 0.4), to.y - ARROW_HEAD * Math.sin(angle - 0.4));
  ctx.lineTo(to.x - ARROW_HEAD * Math.cos(angle + 0.4), to.y - ARROW_HEAD * Math.sin(angle + 0.4));
  ctx.closePath();
  ctx.fill();
}

/** Draws the arrows and centre square. `active` is the handle being dragged or hovered, drawn brighter. */
export function drawMoveGizmo(ctx: CanvasRenderingContext2D, layout: MoveGizmoLayout, palette: ViewPalette, active: Axis | null) {
  const { origin, length, square } = layout;
  ctx.save();
  drawArrow(ctx, origin, { x: origin.x + length, y: origin.y }, palette.gizmoX, active === 'x');
  drawArrow(ctx, origin, { x: origin.x, y: origin.y - length }, palette.gizmoY, active === 'y');
  ctx.globalAlpha = active === 'free' ? 1 : 0.8;
  ctx.fillStyle = palette.selected;
  ctx.fillRect(origin.x - square / 2, origin.y - square / 2, square, square);
  ctx.restore();

}
