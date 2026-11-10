// The viewport canvas: sizing, theme colours and drawing. Pointer handling lives in canvas-input.ts.

import { byId } from './dom';
import { ImageCache } from './assets';
import { drawGizmo } from './gizmo';
import { drawVertices, polygonOf } from './poly-edit';
import { session, onRender, render } from './session';
import { drawScene, DARK_VIEW_PALETTE, type ViewPalette } from './view';
import type { Point } from './picking';

export const canvas = byId<HTMLCanvasElement>('viewport');
const context = canvas.getContext('2d');
if (!context) throw new Error('This browser cannot draw on a canvas.');

export const images = new ImageCache(() => draw());

export function viewSize() {
  const rect = canvas.getBoundingClientRect();
  return { width: rect.width, height: rect.height };
}

/** A pointer position relative to the canvas, in CSS pixels. */
export function localPoint(event: MouseEvent): Point {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

/** Reads the viewport colours from the theme's tokens, so the canvas follows light and dark. */
export function readPalette(): ViewPalette {
  const style = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    background: read('--canvas-bg', DARK_VIEW_PALETTE.background),
    playBackground: read('--canvas-play', DARK_VIEW_PALETTE.playBackground),
    grid: read('--canvas-grid', DARK_VIEW_PALETTE.grid),
    axis: read('--canvas-axis', DARK_VIEW_PALETTE.axis),
    link: read('--canvas-link', DARK_VIEW_PALETTE.link),
    outline: read('--canvas-outline', DARK_VIEW_PALETTE.outline),
    selected: read('--canvas-selected', DARK_VIEW_PALETTE.selected),
    hovered: read('--canvas-hovered', DARK_VIEW_PALETTE.hovered),
    origin: read('--canvas-origin', DARK_VIEW_PALETTE.origin),
    label: read('--canvas-label', DARK_VIEW_PALETTE.label),
    muted: read('--canvas-muted', DARK_VIEW_PALETTE.muted),
    sprite: read('--canvas-sprite', DARK_VIEW_PALETTE.sprite),
    gizmoX: read('--canvas-gizmo-x', DARK_VIEW_PALETTE.gizmoX),
    gizmoY: read('--canvas-gizmo-y', DARK_VIEW_PALETTE.gizmoY),
    gizmoFree: read('--canvas-gizmo-free', DARK_VIEW_PALETTE.gizmoFree)
  };
}

let palette: ViewPalette = readPalette();

/** Call after the theme changes so the canvas picks up the new colours. */
export function refreshPalette() {
  palette = readPalette();
  render();
}

/** Redraws the viewport: the scene, the selection, the current tool's gizmo, and polygon corner handles. */
export function draw() {
  const ctx = context!;
  const image = (path: string) => images.get(path);
  const { state, camera, play, tool, gesture } = session;
  if (play) {
    drawScene(ctx, state.scene, camera, viewSize(), { worlds: play.runtime.worlds, image, gizmos: false, palette });
    return;
  }
  const size = viewSize();
  drawScene(ctx, state.scene, camera, size, { selected: state.selected, hovered: session.hovered, image, gizmos: true, palette });
  const activeHandle = gesture && gesture.kind !== 'vertex' ? gesture.handle : session.gizmoHover?.handle ?? null;
  drawGizmo(ctx, state.scene, state.selected, camera, size, palette, tool, activeHandle);
  if (state.selected !== null && polygonOf(state.scene, state.selected)) {
    const activeVertex = gesture && gesture.kind === 'vertex' ? gesture.index : session.vertexHover;
    drawVertices(ctx, state.scene, state.selected, camera, size, palette, activeVertex);
  }
}

export function resizeCanvas() {
  const { width, height } = viewSize();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  context!.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw();
}

export function initCanvas() {
  onRender(draw);
  window.addEventListener('resize', resizeCanvas);
}
