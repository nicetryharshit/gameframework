import { worldTransform, type Scene, type SceneEntity } from '../scene/index';
import { outlineOf, shapeOf, type Point } from './picking';

/** Where the view is looking. zoom is screen pixels per world unit. y points up in the world, down on screen. */
export interface Camera {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

export interface ViewSize {
  readonly width: number;
  readonly height: number;
}

const MIN_ZOOM = 4;
const MAX_ZOOM = 400;

export function toScreen(camera: Camera, size: ViewSize, point: Point): Point {
  return {
    x: size.width / 2 + (point.x - camera.x) * camera.zoom,
    y: size.height / 2 - (point.y - camera.y) * camera.zoom
  };
}

export function toWorld(camera: Camera, size: ViewSize, point: Point): Point {
  return {
    x: camera.x + (point.x - size.width / 2) / camera.zoom,
    y: camera.y - (point.y - size.height / 2) / camera.zoom
  };
}

/** Zooms by a factor while keeping the world point under the cursor where it was. */
export function zoomAt(camera: Camera, size: ViewSize, screen: Point, factor: number): Camera {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, camera.zoom * factor));
  const anchor = toWorld(camera, size, screen);
  return {
    x: anchor.x - (screen.x - size.width / 2) / zoom,
    y: anchor.y + (screen.y - size.height / 2) / zoom,
    zoom
  };
}

function drawGrid(ctx: CanvasRenderingContext2D, camera: Camera, size: ViewSize) {
  const step = camera.zoom >= 40 ? 1 : camera.zoom >= 10 ? 5 : 10;
  const left = camera.x - size.width / 2 / camera.zoom;
  const right = camera.x + size.width / 2 / camera.zoom;
  const bottom = camera.y - size.height / 2 / camera.zoom;
  const top = camera.y + size.height / 2 / camera.zoom;

  ctx.lineWidth = 1;
  ctx.strokeStyle = '#e2e8f0';
  ctx.beginPath();
  for (let x = Math.floor(left / step) * step; x <= right; x += step) {
    const p = toScreen(camera, size, { x, y: 0 });
    ctx.moveTo(p.x, 0);
    ctx.lineTo(p.x, size.height);
  }
  for (let y = Math.floor(bottom / step) * step; y <= top; y += step) {
    const p = toScreen(camera, size, { x: 0, y });
    ctx.moveTo(0, p.y);
    ctx.lineTo(size.width, p.y);
  }
  ctx.stroke();

  const origin = toScreen(camera, size, { x: 0, y: 0 });
  ctx.strokeStyle = '#94a3b8';
  ctx.beginPath();
  ctx.moveTo(0, origin.y);
  ctx.lineTo(size.width, origin.y);
  ctx.moveTo(origin.x, 0);
  ctx.lineTo(origin.x, size.height);
  ctx.stroke();
}

function drawEntity(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  entity: SceneEntity,
  camera: Camera,
  size: ViewSize,
  selected: boolean
) {
  const world = worldTransform(scene, entity.id);
  const origin = toScreen(camera, size, { x: world.x, y: world.y });

  if (entity.parent !== null) {
    const parent = worldTransform(scene, entity.parent);
    const parentOrigin = toScreen(camera, size, { x: parent.x, y: parent.y });
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(parentOrigin.x, parentOrigin.y);
    ctx.lineTo(origin.x, origin.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  const radians = (world.rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const outline = outlineOf(shapeOf(entity)).map(point => {
    const sx = point.x * world.scaleX;
    const sy = point.y * world.scaleY;
    return toScreen(camera, size, { x: world.x + cos * sx - sin * sy, y: world.y + sin * sx + cos * sy });
  });

  ctx.beginPath();
  outline.forEach((point, index) => (index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y)));
  ctx.closePath();
  const tint = entity.components.sprite?.tint;
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = typeof tint === 'string' ? tint : '#94a3b8';
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.lineWidth = selected ? 2.5 : 1;
  ctx.strokeStyle = selected ? '#2563eb' : '#334155';
  ctx.stroke();

  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.arc(origin.x, origin.y, 3, 0, 2 * Math.PI);
  ctx.fill();
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText(entity.id, origin.x + 6, origin.y - 6);
}

/** Draws the whole scene. The caller sets up any device-pixel scaling on the context before calling. */
export function drawScene(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  camera: Camera,
  size: ViewSize,
  selected: string | null
) {
  ctx.clearRect(0, 0, size.width, size.height);
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, size.width, size.height);
  drawGrid(ctx, camera, size);
  for (const entity of scene.entities) drawEntity(ctx, scene, entity, camera, size, entity.id === selected);
}
