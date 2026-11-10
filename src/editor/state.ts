import { emptyScene, type Scene } from '../scene/index';

export interface EditorState {
  readonly scene: Scene;
  readonly selected: string | null;
  readonly past: readonly Scene[];
  readonly future: readonly Scene[];
  /** The scene as it was last saved or opened. Undoing back to it leaves the editor clean again. */
  readonly saved: Scene;
}

const HISTORY_LIMIT = 200;

export function createEditorState(scene: Scene = emptyScene()): EditorState {
  return { scene, selected: null, past: [], future: [], saved: scene };
}

/** Keeps the selection only while that entity still exists. */
function keepSelection(scene: Scene, selected: string | null): string | null {
  return selected !== null && scene.entities.some(entity => entity.id === selected) ? selected : null;
}

export function isDirty(state: EditorState): boolean {
  return state.scene !== state.saved;
}

export function markSaved(state: EditorState): EditorState {
  return { ...state, saved: state.scene };
}

/** Records the current scene as an undo step. Call it once before a gesture, such as a drag. */
export function checkpoint(state: EditorState): EditorState {
  return { ...state, past: [...state.past, state.scene].slice(-HISTORY_LIMIT), future: [] };
}

/** Moves to a new scene as one undo step. Returns the same state if nothing changed. */
export function commitScene(state: EditorState, scene: Scene): EditorState {
  if (scene === state.scene) return state;
  return { ...checkpoint(state), scene, selected: keepSelection(scene, state.selected) };
}

/** Changes the scene without an undo step. Use it during a gesture, after checkpoint(). */
export function replaceScene(state: EditorState, scene: Scene): EditorState {
  return { ...state, scene, selected: keepSelection(scene, state.selected) };
}

export function selectEntity(state: EditorState, id: string | null): EditorState {
  return { ...state, selected: id };
}

export function undo(state: EditorState): EditorState {
  const previous = state.past[state.past.length - 1];
  if (!previous) return state;
  return {
    ...state,
    scene: previous,
    selected: keepSelection(previous, state.selected),
    past: state.past.slice(0, -1),
    future: [state.scene, ...state.future]
  };
}

export function redo(state: EditorState): EditorState {
  const next = state.future[0];
  if (!next) return state;
  return {
    ...state,
    scene: next,
    selected: keepSelection(next, state.selected),
    past: [...state.past, state.scene],
    future: state.future.slice(1)
  };
}
