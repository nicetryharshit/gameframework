// Shared editor state and the one render loop. Modules read and write `session`, then call render() to refresh the panels.

import { commitScene, createEditorState, type EditorState } from './state';
import type { Camera } from './view';
import type { Point } from './picking';
import type { AssetInfo } from './assets';
import type { FieldValue, Scene, SceneRuntime } from '../scene/index';
import type { GizmoHit, Tool } from './gizmo';
import { demoScene } from './demo-scene';
import { describe, logMessage } from './log';

export const DEFAULT_CAMERA: Camera = { x: 0, y: 0, zoom: 60 };

/** A gesture that edits several fields as one undo step. Created by the scrub and gizmo code. */
export interface LiveEdit {
  set(field: string, value: FieldValue): void;
  finish(): void;
}

/** What a viewport drag is doing. Each kind holds only what it needs. */
export type Gesture =
  | { kind: 'move'; id: string; handle: 'x' | 'y' | 'free' | null; origin: Point; start: Point; checkpointed: boolean }
  | { kind: 'rotate'; id: string; handle: 'ring'; origin: Point; startAngle: number; startRotation: number; live: LiveEdit | null }
  | { kind: 'scale'; id: string; handle: 'x' | 'y' | 'free'; anchor: Point; startScale: Point; startSpan: Point; live: LiveEdit | null }
  | { kind: 'vertex'; id: string; handle: null; index: number; live: LiveEdit | null };

export interface PlayState {
  runtime: SceneRuntime;
  last: number;
  frame: number;
  paused: boolean;
}

export const session = {
  state: createEditorState(demoScene()) as EditorState,
  sceneName: null as string | null,
  camera: DEFAULT_CAMERA,
  snap: 0,
  tool: 'move' as Tool,
  hovered: null as string | null,
  gizmoHover: null as GizmoHit | null,
  vertexHover: null as number | null,
  gesture: null as Gesture | null,
  panning: null as { last: Point } | null,
  assets: [] as AssetInfo[],
  selectedAsset: null as string | null,
  counter: 1,
  play: null as PlayState | null
};

const renderers: Array<() => void> = [];

/** Registers a function that refreshes one part of the editor. Each module registers its own at start-up. */
export function onRender(fn: () => void) {
  renderers.push(fn);
}

export function render() {
  for (const fn of renderers) fn();
}

/** Replaces the editor state. Clears the asset selection whenever the selected entity changes. */
export function apply(next: EditorState) {
  if (next.selected !== session.state.selected) session.selectedAsset = null;
  session.state = next;
  render();
}

/** True while play mode runs. Edits are refused then, so the scene the runtime plays stays the same. */
export function blockedWhilePlaying(): boolean {
  if (!session.play) return false;
  logMessage('warn', 'Stop play mode to edit. Edits are not allowed while the scene is playing.');
  return true;
}

/** Runs a scene change as one undo step. A failed change is logged and the scene is left as it was. */
export function edit(run: (scene: Scene) => Scene) {
  if (blockedWhilePlaying()) {
    render();
    return;
  }
  try {
    apply(commitScene(session.state, run(session.state.scene)));
  } catch (error) {
    logMessage('error', describe(error));
    render();
  }
}
