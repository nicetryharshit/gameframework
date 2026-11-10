// Keyboard shortcuts. Shortcuts do nothing while typing in a field, except Ctrl+P, which always toggles play.

import { apply, session } from './session';
import { redo, selectEntity, undo } from './state';
import { togglePlay, stopPlay } from './play';
import { save } from './io';
import { addEntityAt, deleteSelected, duplicateSelected, focusSelected, NUDGE_STEP, nudge, setTool } from './scene-actions';
import type { Tool } from './gizmo';

const TOOL_KEYS: Record<string, Tool> = { w: 'move', e: 'rotate', r: 'scale' };
const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };

function onKeyDown(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null;
  const typing = target !== null && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName);
  const modifier = event.metaKey || event.ctrlKey;
  const key = event.key.toLowerCase();
  if (modifier && key === 'p') {
    event.preventDefault();
    togglePlay();
    return;
  }
  if (typing) return;
  if (modifier) {
    if (key === 'z') {
      event.preventDefault();
      apply(event.shiftKey ? redo(session.state) : undo(session.state));
    } else if (key === 'y') {
      event.preventDefault();
      apply(redo(session.state));
    } else if (key === 's') {
      event.preventDefault();
      void save();
    } else if (key === 'n' && event.shiftKey) {
      event.preventDefault();
      addEntityAt({});
    } else if (key === 'd') {
      event.preventDefault();
      duplicateSelected();
    }
    return;
  }
  if (event.key === 'Escape') {
    if (session.play) stopPlay();
    else apply(selectEntity(session.state, null));
    return;
  }
  if (event.key === 'Delete' || event.key === 'Backspace') {
    if (session.state.selected) {
      event.preventDefault();
      deleteSelected();
    }
    return;
  }
  if (key === 'f') return focusSelected();
  if (TOOL_KEYS[key]) return setTool(TOOL_KEYS[key]);
  const direction = ARROWS[event.key];
  if (direction && session.state.selected) {
    event.preventDefault();
    const step = event.shiftKey ? 1 : session.snap > 0 ? session.snap : NUDGE_STEP;
    nudge(direction[0] * step, direction[1] * step);
  }
}

export function initKeyboard() {
  window.addEventListener('keydown', onKeyDown);
}
