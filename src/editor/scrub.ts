// Live edits from drags, sliders and colour pickers. A whole gesture is one undo step, however many values it passes through.
// Also the number fields you can drag: dragging a field's label scrubs its value.

import { setField, type FieldSpec, type FieldValue } from '../scene/index';
import { checkpoint, replaceScene } from './state';
import { blockedWhilePlaying, render, session } from './session';
import { draw } from './canvas';
import { registry } from './registry';
import { renderMeta } from './status';
import { describe, logMessage } from './log';
import { format, round } from './util';

/** Sets fields of one component during a gesture. The first change records the single undo step. */
export function liveEdit(id: string, name: string) {
  let checkpointed = false;
  return {
    set(field: string, value: FieldValue) {
      if (!checkpointed) {
        session.state = checkpoint(session.state);
        checkpointed = true;
      }
      session.state = replaceScene(session.state, setField(session.state.scene, id, name, field, value, registry));
      renderMeta();
      draw();
    },
    /** Ends the gesture and redraws the panels once, so every field shows the final values. */
    finish() {
      if (checkpointed) render();
    }
  };
}

/** Lets a number label be dragged to change the value. Shift is fine, Ctrl or Cmd is coarse. `mirror` is a slider kept in step. */
export function attachScrub(handle: HTMLElement, control: HTMLInputElement, id: string, name: string, field: string, spec: FieldSpec, mirror?: HTMLInputElement) {
  handle.classList.add('scrub');
  handle.title = 'Drag to change · Shift for fine · Ctrl for coarse';
  handle.addEventListener('pointerdown', event => {
    if (event.button !== 0 || blockedWhilePlaying()) return;
    const startX = event.clientX;
    const startValue = Number(control.value);
    const bounds = spec as { min?: number; max?: number };
    const live = liveEdit(id, name);
    let moved = false;
    handle.setPointerCapture(event.pointerId);

    const move = (e: PointerEvent) => {
      if (!moved && Math.abs(e.clientX - startX) <= 2) return;
      moved = true;
      document.body.classList.add('scrubbing');
      const speed = e.shiftKey ? 0.01 : e.ctrlKey || e.metaKey ? 1 : 0.1;
      let value = round(startValue + (e.clientX - startX) * speed);
      if (bounds.min !== undefined) value = Math.max(bounds.min, value);
      if (bounds.max !== undefined) value = Math.min(bounds.max, value);
      try {
        live.set(field, value);
      } catch (error) {
        logMessage('error', describe(error));
        stop();
        return;
      }
      control.value = format(value);
      if (mirror) mirror.value = control.value;
    };
    const stop = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', stop);
      handle.removeEventListener('pointercancel', stop);
      document.body.classList.remove('scrubbing');
      if (moved) live.finish();
      else control.focus();
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', stop);
    handle.addEventListener('pointercancel', stop);
  });
}
