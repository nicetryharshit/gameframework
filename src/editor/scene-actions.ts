// Scene commands used by the toolbar, menus, hierarchy and keyboard: create, duplicate, delete, nudge, focus.

import { addEntity, duplicateEntity, removeEntity, worldTransform, type ComponentData } from '../scene/index';
import { apply, blockedWhilePlaying, edit, render, session } from './session';
import { draw } from './canvas';
import { moveEntityBy, type Point } from './picking';
import { commitScene, selectEntity } from './state';
import { registry } from './registry';
import { describe, logMessage } from './log';
import { round } from './util';
import type { Tool } from './gizmo';

export const NUDGE_STEP = 0.1;

/** A fresh id such as "crate-3" that no entity uses yet. */
export function freshId(base: string): string {
  const stem = base.replace(/\.[a-z0-9]+$/i, '').replace(/[^A-Za-z0-9_-]+/g, '-') || 'entity';
  let id: string;
  do {
    id = `${stem}-${session.counter++}`;
  } while (session.state.scene.entities.some(entity => entity.id === id));
  return id;
}

/** Creates an entity. A child is placed at its parent's origin, so its position is local to the parent. */
export function addEntityAt(components: Record<string, ComponentData>, base = 'entity', at?: Point, parent: string | null = null) {
  const id = freshId(base);
  const position = parent !== null ? { x: 0, y: 0 } : at ?? session.camera;
  edit(scene => addEntity(scene, { id, parent, components: { transform: { x: round(position.x), y: round(position.y) }, ...components } }, registry));
  if (session.state.scene.entities.some(entity => entity.id === id)) apply(selectEntity(session.state, id));
}

export function duplicateSelected() {
  const source = session.state.selected;
  if (!source) return;
  const id = freshId(`${source}-copy`);
  edit(scene => duplicateEntity(scene, source, id, registry));
  if (session.state.scene.entities.some(entity => entity.id === id)) apply(selectEntity(session.state, id));
}

export function deleteSelected() {
  const id = session.state.selected;
  if (id) edit(scene => removeEntity(scene, id));
}

/** Moves the selected entity by one step, with the arrow keys. Each press is its own undo step. */
export function nudge(dx: number, dy: number) {
  const id = session.state.selected;
  if (!id || blockedWhilePlaying()) return;
  try {
    apply(commitScene(session.state, moveEntityBy(session.state.scene, id, { x: dx, y: dy }, registry, session.snap)));
  } catch (error) {
    logMessage('error', describe(error));
  }
}

export function focusSelected() {
  const id = session.state.selected;
  if (!id) return;
  const world = worldTransform(session.state.scene, id);
  session.camera = { ...session.camera, x: world.x, y: world.y };
  draw();
}

export function resetView() {
  session.camera = { x: 0, y: 0, zoom: 60 };
  draw();
}

export function setSnap(step: number) {
  session.snap = step;
  render();
}

/** Switches the transform tool (move, rotate or scale). */
export function setTool(tool: Tool) {
  session.tool = tool;
  render();
}
