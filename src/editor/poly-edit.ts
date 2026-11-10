// Editing a polygon collider in the viewport: the corners are handles you drag, double-click an edge to add one,
// and right-click a corner to remove it. The points are stored in the entity's own units.

import { getEntity, worldTransform, type Point2, type Scene, type Transform2D } from '../scene/index';
import { toScreen, type Camera, type ViewPalette, type ViewSize } from './view';
import { toLocal, type Point } from './picking';
import { distanceToSegment } from './gizmo/geometry';

export const VERTEX = { size: 8, grab: 7, edge: 6 } as const;
export const MIN_POINTS = 3;

/** The polygon's points if the entity has a polygon collider, otherwise null. */
export function polygonOf(scene: Scene, id: string): readonly Point2[] | null {
  const collider = getEntity(scene, id).components.collider as { shape?: unknown; points?: unknown } | undefined;
  if (!collider || collider.shape !== 'polygon') return null;
  return (collider.points as Point2[] | undefined) ?? [];
}

/** Local units to world, using the same order the renderer uses: scale, then rotate, then move. */
export function localToWorld(t: Transform2D, p: Point): Point {
  const radians = (t.rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const x = p.x * t.scaleX;
  const y = p.y * t.scaleY;
  return { x: t.x + x * cos - y * sin, y: t.y + x * sin + y * cos };
}

/** The screen position of one of the entity's polygon points. */
function screenOf(scene: Scene, id: string, camera: Camera, size: ViewSize, p: Point): Point {
  return toScreen(camera, size, localToWorld(worldTransform(scene, id), p));
}

/** The corner under a screen point, or null. The nearest one wins. */
export function hitVertex(scene: Scene, id: string, camera: Camera, size: ViewSize, screen: Point): number | null {
  const points = polygonOf(scene, id) ?? [];
  let best: { index: number; distance: number } | null = null;
  points.forEach((p, index) => {
    const at = screenOf(scene, id, camera, size, p);
    const distance = Math.hypot(screen.x - at.x, screen.y - at.y);
    if (distance <= VERTEX.grab && (best === null || distance < best.distance)) best = { index, distance };
  });
  return best === null ? null : (best as { index: number }).index;
}

/** The edge under a screen point, as the index a new corner would take and where it goes in local units. */
export function hitEdge(scene: Scene, id: string, camera: Camera, size: ViewSize, screen: Point, world: Point): { index: number; local: Point } | null {
  const points = polygonOf(scene, id) ?? [];
  for (let i = 0; i < points.length; i++) {
    const a = screenOf(scene, id, camera, size, points[i]);
    const b = screenOf(scene, id, camera, size, points[(i + 1) % points.length]);
    if (distanceToSegment(screen, a, b) <= VERTEX.edge) {
      const local = toLocal(worldTransform(scene, id), world);
      return local ? { index: i + 1, local } : null;
    }
  }
  return null;
}

/** New points with a corner added at `index`. */
export function insertPoint(points: readonly Point2[], index: number, point: Point): Point2[] {
  const next = [...points];
  next.splice(index, 0, { x: round(point.x), y: round(point.y) });
  return next;
}

/** New points without the corner at `index`, or null when that would leave fewer than three. */
export function removePoint(points: readonly Point2[], index: number): Point2[] | null {
  if (points.length <= MIN_POINTS) return null;
  return points.filter((_, i) => i !== index);
}

const round = (value: number) => Math.round(value * 1000) / 1000;

/** Draws the corner handles of a polygon collider. `active` is the corner being dragged or hovered. */
export function drawVertices(ctx: CanvasRenderingContext2D, scene: Scene, id: string, camera: Camera, size: ViewSize, palette: ViewPalette, active: number | null) {
  const points = polygonOf(scene, id) ?? [];
  ctx.save();
  points.forEach((p, index) => {
    const at = screenOf(scene, id, camera, size, p);
    const half = VERTEX.size / 2;
    ctx.fillStyle = index === active ? palette.selected : palette.background;
    ctx.strokeStyle = palette.selected;
    ctx.lineWidth = 1.5;
    ctx.fillRect(at.x - half, at.y - half, VERTEX.size, VERTEX.size);
    ctx.strokeRect(at.x - half, at.y - half, VERTEX.size, VERTEX.size);
  });
  ctx.restore();
}
