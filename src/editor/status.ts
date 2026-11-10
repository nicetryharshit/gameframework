// The header name, the viewport overlay and the status line that show scene and cursor details.

import { byId } from './dom';
import { isDirty } from './state';
import { onRender, session } from './session';

const overlayName = byId<HTMLElement>('scene-name');
const metaEl = byId<HTMLElement>('meta');
export const cursorEl = byId<HTMLElement>('cursor');

export function renderMeta() {
  const dirty = isDirty(session.state);
  overlayName.textContent = `${session.sceneName ? `scenes/${session.sceneName}.scene.json` : 'Unsaved scene'}${dirty ? ' *' : ''}`;
  metaEl.textContent = `${session.snap > 0 ? `snap ${session.snap}` : 'snap off'} · zoom ${Math.round(session.camera.zoom)} px/unit · ${session.state.scene.entities.length} entities`;
}

export function initStatus() {
  onRender(renderMeta);
}
