// Toolbar: undo and redo, the Add dropdown, the transform tools, save, import, and theme changes. Play and pause live in play.ts.

import { byId } from './dom';
import { commandItems, showPopup } from './chrome';
import { apply, onRender, session } from './session';
import { undo, redo } from './state';
import { refreshPalette } from './canvas';
import { save } from './io';
import { importPicker } from './assets-panel';
import { setTool } from './scene-actions';
import type { Tool } from './gizmo';

const undoButton = byId<HTMLButtonElement>('undo');
const redoButton = byId<HTMLButtonElement>('redo');
const toolButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-tool]'));

export function initToolbar() {
  byId('add-button').addEventListener('click', event => showPopup(event.currentTarget as HTMLElement, commandItems('Entity')));
  undoButton.addEventListener('click', () => apply(undo(session.state)));
  redoButton.addEventListener('click', () => apply(redo(session.state)));
  byId('save').addEventListener('click', () => void save());
  byId('import-assets').addEventListener('click', importPicker);
  for (const button of toolButtons) button.addEventListener('click', () => setTool(button.dataset.tool as Tool));
  window.addEventListener('themechange', refreshPalette);
  onRender(() => {
    undoButton.disabled = session.state.past.length === 0;
    redoButton.disabled = session.state.future.length === 0;
    for (const button of toolButtons) button.setAttribute('aria-pressed', String(button.dataset.tool === session.tool));
  });
}
