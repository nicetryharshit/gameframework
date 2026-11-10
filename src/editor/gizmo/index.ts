// Gizmos drawn over the selected entity. One file per tool; this file picks the tool and forwards to it.
// To add a tool: add its file (hit, draw, cursor), a name in `Tool`, and a case below.

import { worldTransform, type Scene } from '../../scene/index';
import { toScreen, type Camera, type ViewPalette, type ViewSize } from '../view';
import type { Point } from '../picking';
import { drawMoveGizmo } from './draw';
import { hitAxis, moveGizmoAt, type Axis, type MoveGizmoLayout } from './geometry';
import { drawRing, hitRing } from './rotate';
import { drawScale, hitScale } from './scale';

export { constrainDelta, type Axis } from './geometry';
export { worldAngle } from './rotate';

export type Tool = 'move' | 'rotate' | 'scale';
export type GizmoHandle = Axis | 'ring';
export interface GizmoHit {
  readonly tool: Tool;
  readonly handle: GizmoHandle;
}

/** The selected entity's origin on screen, and the gizmo drawn there. */
function anchorOf(scene: Scene, id: string, camera: Camera, size: ViewSize) {
  const world = worldTransform(scene, id);
  const screen = toScreen(camera, size, { x: world.x, y: world.y });
  return { world, screen, layout: moveGizmoAt(screen) };
}

/** The handle of the current tool under a screen point, or null. */
export function hitGizmo(scene: Scene, id: string | null, camera: Camera, size: ViewSize, point: Point, tool: Tool): GizmoHit | null {
  if (id === null) return null;
  const { screen, layout } = anchorOf(scene, id, camera, size);
  if (tool === 'move') {
    const handle = hitAxis(layout, point);
    return handle ? { tool, handle } : null;
  }
  if (tool === 'rotate') return hitRing(screen, point) ? { tool, handle: 'ring' } : null;
  const handle = hitScale(layout, point);
  return handle ? { tool, handle } : null;
}

/** Draws the current tool's gizmo for the selected entity. `active` is the handle being dragged or hovered. */
export function drawGizmo(ctx: CanvasRenderingContext2D, scene: Scene, id: string | null, camera: Camera, size: ViewSize, palette: ViewPalette, tool: Tool, active: GizmoHandle | null) {
  if (id === null) return;
  const { screen, layout } = anchorOf(scene, id, camera, size);
  if (tool === 'move') drawMoveGizmo(ctx, layout, palette, active === 'ring' ? null : active);
  else if (tool === 'rotate') drawRing(ctx, screen, palette, active === 'ring');
  else drawScale(ctx, layout, palette, active === 'ring' ? null : active);
}

/** The cursor to show over a handle. */
export function cursorFor(hit: GizmoHit): string {
  if (hit.tool === 'rotate') return 'grab';
  if (hit.tool === 'scale') return hit.handle === 'x' ? 'ew-resize' : hit.handle === 'y' ? 'ns-resize' : 'nwse-resize';
  return hit.handle === 'x' ? 'ew-resize' : hit.handle === 'y' ? 'ns-resize' : 'move';
}

export type { MoveGizmoLayout };
