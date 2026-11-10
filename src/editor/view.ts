import { worldTransform, type Scene, type SceneEntity, type Transform2D } from '../scene/index';
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

/** Colours for the viewport. The editor fills these from the active theme, so the canvas follows light and dark. */
export interface ViewPalette {
  readonly background: string;
  readonly playBackground: string;
  readonly grid: string;
  readonly axis: string;
  readonly link: string;
  readonly outline: string;
  readonly selected: string;
  readonly hovered: string;
  readonly origin: string;
  readonly label: string;
  readonly muted: string;
  readonly sprite: string;
  readonly gizmoX: string;
  readonly gizmoY: string;
  readonly gizmoFree: string;
}

export const DARK_VIEW_PALETTE: ViewPalette = {
  background: '#161616', playBackground: '#0b0b0b', grid: '#242424', axis: '#3d3d3d', link: '#878787',
  outline: '#5b6270', selected: '#e6b86a', hovered: '#c3d7ff', origin: '#101010', label: '#a8afb9', muted: '#878787', sprite: '#94a3b8',
  gizmoX: '#ff6b6b', gizmoY: '#7bd88f', gizmoFree: '#e6e6e6'
};

let palette: ViewPalette = DARK_VIEW_PALETTE;

export interface DrawOptions {
  /** Colours to draw with. Defaults to the dark palette. */
  readonly palette?: ViewPalette;
  /** The selected entity, outlined in blue. Only used with gizmos. */
  readonly selected?: string | null;
  /** The entity under the pointer, outlined lightly. Only used with gizmos. */
  readonly hovered?: string | null;
  /** Transforms to draw with, such as those from a play-mode runtime. Defaults to the scene's own transforms. */
  readonly worlds?: ReadonlyMap<string, Transform2D>;
  /** Returns a loaded image for an asset path, or undefined while it loads or when it is missing. */
  readonly image?: (path: string) => CanvasImageSource | undefined;
  /** Editor view: grid, outlines, labels and links. Off for the game view. Defaults to on. */
  readonly gizmos?: boolean;
}

function drawGrid(ctx: CanvasRenderingContext2D, camera: Camera, size: ViewSize) {
  const step = camera.zoom >= 40 ? 1 : camera.zoom >= 10 ? 5 : 10;
  const left = camera.x - size.width / 2 / camera.zoom;
  const right = camera.x + size.width / 2 / camera.zoom;
  const bottom = camera.y - size.height / 2 / camera.zoom;
  const top = camera.y + size.height / 2 / camera.zoom;

  ctx.lineWidth = 1;
  ctx.strokeStyle = palette.grid;
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
  ctx.strokeStyle = palette.axis;
  ctx.beginPath();
  ctx.moveTo(0, origin.y);
  ctx.lineTo(size.width, origin.y);
  ctx.moveTo(origin.x, 0);
  ctx.lineTo(origin.x, size.height);
  ctx.stroke();
}

type Emphasis = 'selected' | 'hovered' | 'none';

function drawEntity(
  ctx: CanvasRenderingContext2D,
  entity: SceneEntity,
  world: Transform2D,
  worldOf: (id: string) => Transform2D,
  camera: Camera,
  size: ViewSize,
  gizmos: boolean,
  image: DrawOptions['image'],
  emphasis: Emphasis
) {
  const origin = toScreen(camera, size, { x: world.x, y: world.y });

  if (gizmos && entity.parent !== null) {
    const parent = worldOf(entity.parent);
    const parentOrigin = toScreen(camera, size, { x: parent.x, y: parent.y });
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = palette.link;
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

  const texture = entity.components.sprite?.texture;
  const loaded = typeof texture === 'string' && texture !== '' && image ? image(texture) : undefined;
  if (loaded) {
    const width = Number(entity.components.sprite?.width ?? 1);
    const height = Number(entity.components.sprite?.height ?? 1);
    const z = camera.zoom;
    const m00 = cos * world.scaleX;
    const m01 = -sin * world.scaleY;
    const m10 = sin * world.scaleX;
    const m11 = cos * world.scaleY;
    ctx.save();
    // Maps the entity's local units onto the screen, flipping y so world y points up. The extra scale(1, -1)
    // turns the image right way up, since image rows run downwards.
    ctx.transform(z * m00, -z * m10, z * m01, -z * m11, origin.x, origin.y);
    ctx.scale(1, -1);
    ctx.drawImage(loaded, -width / 2, -height / 2, width, height);
    ctx.restore();
  }

  const outline = outlineOf(shapeOf(entity)).map(point => {
    const sx = point.x * world.scaleX;
    const sy = point.y * world.scaleY;
    return toScreen(camera, size, { x: world.x + cos * sx - sin * sy, y: world.y + sin * sx + cos * sy });
  });
  const path = () => {
    ctx.beginPath();
    outline.forEach((point, index) => (index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y)));
    ctx.closePath();
  };

  if (!loaded) {
    path();
    const tint = entity.components.sprite?.tint;
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = typeof tint === 'string' ? tint : palette.sprite;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  if (gizmos) {
    path();
    ctx.lineWidth = emphasis === 'selected' ? 2.5 : emphasis === 'hovered' ? 1.5 : 1;
    ctx.strokeStyle = emphasis === 'selected' ? palette.selected : emphasis === 'hovered' ? palette.hovered : palette.outline;
    ctx.stroke();

    ctx.fillStyle = palette.origin;
    ctx.beginPath();
    ctx.arc(origin.x, origin.y, 3, 0, 2 * Math.PI);
    ctx.fill();
    ctx.font = '12px Inter, system-ui, sans-serif';
    ctx.fillStyle = palette.label;
    ctx.fillText(entity.id, origin.x + 6, origin.y - 6);
    if (entity.components.audio) ctx.fillText('♪', origin.x + 6, origin.y + 12);
  }
}

/** Draws the scene. The caller sets up any device-pixel scaling on the context before calling. */
export function drawScene(ctx: CanvasRenderingContext2D, scene: Scene, camera: Camera, size: ViewSize, options: DrawOptions = {}) {
  const gizmos = options.gizmos !== false;
  palette = options.palette ?? DARK_VIEW_PALETTE;
  ctx.clearRect(0, 0, size.width, size.height);
  ctx.fillStyle = gizmos ? palette.background : palette.playBackground;
  ctx.fillRect(0, 0, size.width, size.height);
  if (gizmos) drawGrid(ctx, camera, size);
  if (scene.entities.length === 0) {
    if (gizmos) {
      ctx.fillStyle = palette.muted;
      ctx.font = '12px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('The scene is empty. Add an entity from the toolbar.', size.width / 2, size.height / 2);
      ctx.textAlign = 'start';
    }
    return;
  }
  const worldOf = (id: string) => options.worlds?.get(id) ?? worldTransform(scene, id);
  for (const entity of scene.entities) {
    const emphasis: Emphasis = entity.id === options.selected ? 'selected' : entity.id === options.hovered ? 'hovered' : 'none';
    drawEntity(ctx, entity, worldOf(entity.id), worldOf, camera, size, gizmos, options.image, emphasis);
  }
}
