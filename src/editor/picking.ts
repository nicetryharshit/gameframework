import {
  colliderSchema,
  createDefaultRegistry,
  defaultsFor,
  getEntity,
  readTransform,
  setComponent,
  worldTransform,
  type ComponentRegistry,
  type Scene,
  type SceneEntity,
  type Transform2D
} from '../scene/index';

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** The area an entity covers, in its own units. Entities without a collider are drawn as a unit box. */
export type Shape =
  | { readonly kind: 'box'; readonly width: number; readonly height: number }
  | { readonly kind: 'circle'; readonly radius: number }
  | { readonly kind: 'polygon'; readonly points: readonly Point[] };

export function shapeOf(entity: SceneEntity): Shape {
  if (!entity.components.collider) {
    const sprite = entity.components.sprite;
    return sprite
      ? { kind: 'box', width: Number(sprite.width ?? 1), height: Number(sprite.height ?? 1) }
      : { kind: 'box', width: 1, height: 1 };
  }
  const data = { ...defaultsFor(colliderSchema), ...entity.components.collider };
  if (data.shape === 'circle') return { kind: 'circle', radius: data.radius as number };
  if (data.shape === 'polygon') return { kind: 'polygon', points: (data.points as Point[]) ?? [] };
  return { kind: 'box', width: data.width as number, height: data.height as number };
}

/** Outline in the entity's own units, centred on its origin. Circles become 32-sided polygons. */
export function outlineOf(shape: Shape): Point[] {
  if (shape.kind === 'polygon') return [...shape.points];
  if (shape.kind === 'box') {
    const hw = shape.width / 2;
    const hh = shape.height / 2;
    return [
      { x: -hw, y: -hh },
      { x: hw, y: -hh },
      { x: hw, y: hh },
      { x: -hw, y: hh }
    ];
  }
  const points: Point[] = [];
  for (let i = 0; i < 32; i++) {
    const angle = (i / 32) * 2 * Math.PI;
    points.push({ x: Math.cos(angle) * shape.radius, y: Math.sin(angle) * shape.radius });
  }
  return points;
}

/** Maps a world point into an entity's local space. Returns null when the entity has a zero scale and cannot be hit. */
export function toLocal(world: Transform2D, point: Point): Point | null {
  if (world.scaleX === 0 || world.scaleY === 0) return null;
  const radians = (world.rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = point.x - world.x;
  const dy = point.y - world.y;
  return { x: (dx * cos + dy * sin) / world.scaleX, y: (-dx * sin + dy * cos) / world.scaleY };
}

/** Even-odd rule: a point is inside when a ray from it crosses the outline an odd number of times. */
export function insidePolygon(points: readonly Point[], point: Point): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i];
    const b = points[j];
    if (a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** The topmost entity under a world point. Later entities are drawn on top, so they win. */
export function pickEntity(scene: Scene, point: Point): string | null {
  for (let i = scene.entities.length - 1; i >= 0; i--) {
    const entity = scene.entities[i];
    const local = toLocal(worldTransform(scene, entity.id), point);
    if (!local) continue;
    const shape = shapeOf(entity);
    const inside =
      shape.kind === 'box'
        ? Math.abs(local.x) <= shape.width / 2 && Math.abs(local.y) <= shape.height / 2
        : shape.kind === 'circle'
          ? local.x * local.x + local.y * local.y <= shape.radius * shape.radius
          : insidePolygon(shape.points, local);
    if (inside) return entity.id;
  }
  return null;
}

const IDENTITY: Transform2D = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };
const round = (value: number) => Math.round(value * 1000) / 1000;

/** Converts a world-space distance into the entity's local units, taking its parent's rotation and scale into account. */
export function localDeltaFor(scene: Scene, id: string, delta: Point): Point {
  const entity = getEntity(scene, id);
  const parent = entity.parent === null ? IDENTITY : worldTransform(scene, entity.parent);
  if (parent.scaleX === 0 || parent.scaleY === 0) {
    throw new Error(`"${id}" sits under a zero-scale parent, so it cannot be moved in the view.`);
  }
  const radians = (parent.rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: (delta.x * cos + delta.y * sin) / parent.scaleX,
    y: (-delta.x * sin + delta.y * cos) / parent.scaleY
  };
}

/**
 * Sets an entity's local position. With a snap step above zero, the position is rounded to the nearest multiple of it.
 * Drags should pass the unsnapped start position plus the total movement, not the last snapped position, so small
 * moves still add up.
 */
export function setPosition(scene: Scene, id: string, position: Point, registry: ComponentRegistry = createDefaultRegistry(), snap = 0): Scene {
  const entity = getEntity(scene, id);
  const place = (value: number) => (snap > 0 ? round(Math.round(value / snap) * snap) : round(value));
  return setComponent(
    scene,
    id,
    'transform',
    { ...entity.components.transform, x: place(position.x), y: place(position.y) },
    registry
  );
}

/** Moves an entity by a world-space distance, for keyboard nudging and tests. */
export function moveEntityBy(scene: Scene, id: string, delta: Point, registry: ComponentRegistry = createDefaultRegistry(), snap = 0): Scene {
  const current = readTransform(getEntity(scene, id));
  const local = localDeltaFor(scene, id, delta);
  return setPosition(scene, id, { x: current.x + local.x, y: current.y + local.y }, registry, snap);
}
