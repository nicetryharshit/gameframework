// Viewport mouse input: select and move, drag gizmo handles, edit polygon corners, pan, zoom, and drop assets into the scene.

import { getEntity, readTransform, setField, worldTransform } from '../scene/index';
import { apply, edit, render, session, type Gesture } from './session';
import { canvas, draw, localPoint, viewSize } from './canvas';
import { cursorEl, renderMeta } from './status';
import { constrainDelta, cursorFor, hitGizmo, worldAngle, type GizmoHit } from './gizmo';
import { localDeltaFor, pickEntity, setPosition, toLocal, type Point } from './picking';
import { checkpoint, replaceScene, selectEntity } from './state';
import { toWorld, zoomAt } from './view';
import { assetKindOf } from './assets';
import { addEntityAt } from './scene-actions';
import { hitEdge, hitVertex, insertPoint, polygonOf, removePoint } from './poly-edit';
import { liveEdit } from './scrub';
import { registry } from './registry';
import { describe, logMessage } from './log';
import { format, round } from './util';

const ROTATE_SNAP_DEGREES = 15;

const sameHit = (a: GizmoHit | null, b: GizmoHit | null) => a?.tool === b?.tool && a?.handle === b?.handle;

function startMove(id: string, world: Point) {
  const start = readTransform(getEntity(session.state.scene, id));
  session.gesture = { kind: 'move', id, handle: null, origin: world, start: { x: start.x, y: start.y }, checkpointed: false };
}

/** Starts a gesture from a gizmo handle. Each tool records what it needs to work out the new values. */
function startGizmo(hit: GizmoHit, id: string, world: Point) {
  const { scene } = session.state;
  const local = readTransform(getEntity(scene, id));
  const world0 = worldTransform(scene, id);
  const anchor = { x: world0.x, y: world0.y };
  if (hit.tool === 'move') {
    session.gesture = { kind: 'move', id, handle: hit.handle as 'x' | 'y' | 'free', origin: world, start: { x: local.x, y: local.y }, checkpointed: false };
  } else if (hit.tool === 'rotate') {
    session.gesture = { kind: 'rotate', id, handle: 'ring', origin: anchor, startAngle: worldAngle(anchor, world), startRotation: local.rotation, live: null };
  } else {
    session.gesture = {
      kind: 'scale',
      id,
      handle: hit.handle as 'x' | 'y' | 'free',
      anchor,
      startScale: { x: local.scaleX, y: local.scaleY },
      startSpan: { x: world.x - anchor.x, y: world.y - anchor.y },
      live: null
    };
  }
}

function onPointerDown(event: PointerEvent) {
  canvas.setPointerCapture(event.pointerId);
  const screen = localPoint(event);
  if (session.play) {
    session.gesture = null;
    session.panning = { last: screen };
    return;
  }
  const { state, camera, tool } = session;
  const size = viewSize();
  const world = toWorld(camera, size, screen);
  const id = state.selected;
  if (id !== null) {
    // Polygon corners first, then the gizmo, then the body underneath.
    const index = hitVertex(state.scene, id, camera, size, screen);
    if (index !== null) {
      session.gesture = { kind: 'vertex', id, handle: null, index, live: null };
      session.panning = null;
      return;
    }
    const hit = hitGizmo(state.scene, id, camera, size, screen, tool);
    if (hit) {
      startGizmo(hit, id, world);
      session.panning = null;
      return;
    }
  }
  const hit = pickEntity(state.scene, world);
  if (hit) {
    startMove(hit, world);
    session.panning = null;
  } else {
    session.gesture = null;
    session.panning = { last: screen };
  }
  apply(selectEntity(state, hit));
}

function moveDrag(g: Extract<Gesture, { kind: 'move' }>, world: Point) {
  const worldDelta = constrainDelta(g.handle ?? 'free', { x: world.x - g.origin.x, y: world.y - g.origin.y });
  const delta = localDeltaFor(session.state.scene, g.id, worldDelta);
  const next = setPosition(session.state.scene, g.id, { x: g.start.x + delta.x, y: g.start.y + delta.y }, registry, session.snap);
  if (!g.checkpointed) {
    session.state = checkpoint(session.state);
    g.checkpointed = true;
  }
  session.state = replaceScene(session.state, next);
  render();
}

function rotateDrag(g: Extract<Gesture, { kind: 'rotate' }>, world: Point, shift: boolean) {
  let rotation = g.startRotation + (worldAngle(g.origin, world) - g.startAngle);
  if (shift) rotation = Math.round(rotation / ROTATE_SNAP_DEGREES) * ROTATE_SNAP_DEGREES;
  g.live ??= liveEdit(g.id, 'transform');
  g.live.set('rotation', round(rotation));
}

function scaleDrag(g: Extract<Gesture, { kind: 'scale' }>, world: Point) {
  const span = { x: world.x - g.anchor.x, y: world.y - g.anchor.y };
  // Ratio of the pointer's distance now to its distance when the drag started. Scales never go below 0.01.
  const ratio = (now: number, start: number) => (Math.abs(start) < 1e-6 ? 1 : Math.max(0.01, now / start));
  let sx = g.startScale.x;
  let sy = g.startScale.y;
  if (g.handle === 'x') sx = g.startScale.x * ratio(span.x, g.startSpan.x);
  else if (g.handle === 'y') sy = g.startScale.y * ratio(span.y, g.startSpan.y);
  else {
    const k = ratio(Math.hypot(span.x, span.y), Math.hypot(g.startSpan.x, g.startSpan.y));
    sx *= k;
    sy *= k;
  }
  g.live ??= liveEdit(g.id, 'transform');
  if (g.handle !== 'y') g.live.set('scaleX', round(sx));
  if (g.handle !== 'x') g.live.set('scaleY', round(sy));
}

function vertexDrag(g: Extract<Gesture, { kind: 'vertex' }>, world: Point) {
  const { scene } = session.state;
  const local = toLocal(worldTransform(scene, g.id), world);
  if (!local) return;
  const snap = (value: number) => (session.snap > 0 ? Math.round(value / session.snap) * session.snap : value);
  const points = polygonOf(scene, g.id) ?? [];
  const next = points.map((p, i) => (i === g.index ? { x: round(snap(local.x)), y: round(snap(local.y)) } : { x: p.x, y: p.y }));
  g.live ??= liveEdit(g.id, 'collider');
  g.live.set('points', next);
}

/** Applies one step of the current gesture. Errors end the gesture and are logged. */
function onGestureMove(g: Gesture, world: Point, shift: boolean) {
  try {
    if (g.kind === 'move') moveDrag(g, world);
    else if (g.kind === 'rotate') rotateDrag(g, world, shift);
    else if (g.kind === 'scale') scaleDrag(g, world);
    else vertexDrag(g, world);
  } catch (error) {
    logMessage('error', describe(error));
    session.gesture = null;
  }
}

function onPointerMove(event: PointerEvent) {
  const screen = localPoint(event);
  const { camera, state, tool } = session;
  const size = viewSize();
  const world = toWorld(camera, size, screen);
  cursorEl.textContent = session.play ? '' : `x ${format(world.x)}  y ${format(world.y)}`;
  if (session.gesture && !session.play) {
    onGestureMove(session.gesture, world, event.shiftKey);
    return;
  }
  if (session.panning) {
    session.camera = {
      ...camera,
      x: camera.x - (screen.x - session.panning.last.x) / camera.zoom,
      y: camera.y + (screen.y - session.panning.last.y) / camera.zoom
    };
    session.panning.last = screen;
    draw();
    return;
  }
  if (session.play) return;

  // Hover: the gizmo handle or polygon corner under the pointer, otherwise the entity under it.
  const hit = hitGizmo(state.scene, state.selected, camera, size, screen, tool);
  if (!sameHit(hit, session.gizmoHover)) {
    session.gizmoHover = hit;
    draw();
  }
  const vertex = state.selected !== null ? hitVertex(state.scene, state.selected, camera, size, screen) : null;
  if (vertex !== session.vertexHover) {
    session.vertexHover = vertex;
    draw();
  }
  const over = pickEntity(state.scene, world);
  canvas.style.cursor = hit ? cursorFor(hit) : vertex !== null || over ? 'move' : 'grab';
  if (over !== session.hovered) {
    session.hovered = over;
    draw();
  }
}

function onPointerLeave() {
  cursorEl.textContent = '';
  if (session.hovered !== null || session.gizmoHover !== null || session.vertexHover !== null) {
    session.hovered = null;
    session.gizmoHover = null;
    session.vertexHover = null;
    draw();
  }
}

/** Ends a drag. Gestures that edit several fields are closed so the panels show their final values. */
function onPointerEnd() {
  const g = session.gesture;
  if (g && g.kind !== 'move' && g.live) g.live.finish();
  session.gesture = null;
  session.panning = null;
}

function onWheel(event: WheelEvent) {
  event.preventDefault();
  session.camera = zoomAt(session.camera, viewSize(), localPoint(event), Math.exp(-event.deltaY * 0.0015));
  renderMeta();
  draw();
}

/** Double-click an edge of a polygon collider to add a corner where you clicked. */
function onDoubleClick(event: MouseEvent) {
  const id = session.state.selected;
  if (id === null || session.play) return;
  const screen = localPoint(event);
  const size = viewSize();
  const edge = hitEdge(session.state.scene, id, session.camera, size, screen, toWorld(session.camera, size, screen));
  if (!edge) return;
  const points = polygonOf(session.state.scene, id) ?? [];
  edit(scene => setField(scene, id, 'collider', 'points', insertPoint(points, edge.index, edge.local), registry));
}

/** Right-click a polygon corner to remove it. Right-click elsewhere keeps the browser menu out of the way. */
function onContextMenu(event: MouseEvent) {
  const id = session.state.selected;
  if (id === null || session.play) return;
  const size = viewSize();
  const index = hitVertex(session.state.scene, id, session.camera, size, localPoint(event));
  if (index === null) return;
  event.preventDefault();
  const next = removePoint(polygonOf(session.state.scene, id) ?? [], index);
  if (!next) return logMessage('warn', 'A polygon needs at least three corners.');
  edit(scene => setField(scene, id, 'collider', 'points', next, registry));
}

function onAssetDrop(event: DragEvent) {
  const path = event.dataTransfer?.getData('application/x-asset');
  if (!path) return;
  event.preventDefault();
  const world = toWorld(session.camera, viewSize(), localPoint(event));
  const kind = assetKindOf(path);
  const base = path.split('/').pop() ?? 'entity';
  if (kind === 'image') addEntityAt({ sprite: { texture: path } }, base, world);
  if (kind === 'audio') addEntityAt({ audio: { clip: path } }, base, world);
}

export function initCanvasInput() {
  canvas.addEventListener('dragover', event => {
    if (event.dataTransfer?.types.includes('application/x-asset')) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    }
  });
  canvas.addEventListener('drop', onAssetDrop);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerleave', onPointerLeave);
  canvas.addEventListener('pointerup', onPointerEnd);
  canvas.addEventListener('pointercancel', onPointerEnd);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('dblclick', onDoubleClick);
  canvas.addEventListener('contextmenu', onContextMenu);
}
