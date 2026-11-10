// Saving, opening, downloading and creating scenes. Everything that touches the scenes folder goes through here.

import { parseScene, sceneToJson } from '../scene/index';
import { byId, element, button } from './dom';
import { listScenes, readScene, writeScene } from './assets';
import { apply, session } from './session';
import { createEditorState, isDirty, markSaved } from './state';
import { describe, logMessage } from './log';
import { registry } from './registry';

const openDialog = byId<HTMLDialogElement>('open-dialog');
const openList = byId<HTMLElement>('open-list');

function confirmDiscard(): boolean {
  return !isDirty(session.state) || window.confirm('You have unsaved changes. Discard them?');
}

export async function save() {
  let name = session.sceneName;
  if (!name) {
    const answer = window.prompt('Scene name (lowercase letters, numbers and dashes)', 'level-1');
    if (!answer) return;
    name = answer.trim().toLowerCase();
  }
  try {
    const result = await writeScene(name, sceneToJson(session.state.scene, registry));
    session.sceneName = name;
    apply(markSaved(session.state));
    logMessage('info', `Saved ${result.path}.`, { href: result.downloadUrl, label: 'Download' });
  } catch (error) {
    logMessage('error', `Could not save: ${describe(error)}`);
  }
}

/** Downloads the scene as it is now, saved or not, without touching the project. */
export function downloadCurrent() {
  const url = URL.createObjectURL(new Blob([sceneToJson(session.state.scene, registry)], { type: 'application/json' }));
  const link = element('a');
  link.href = url;
  link.download = `${session.sceneName ?? 'scene'}.scene.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  logMessage('info', `Downloaded ${link.download}.`);
}

export async function openScene(name: string) {
  try {
    const { scene, warnings } = parseScene(await readScene(name), registry);
    session.sceneName = name;
    apply(createEditorState(scene));
    logMessage('info', `Opened scenes/${name}.scene.json.`);
    for (const warning of warnings) logMessage('warn', warning);
  } catch (error) {
    logMessage('error', describe(error));
  }
}

export function newScene() {
  if (!confirmDiscard()) return;
  session.sceneName = null;
  apply(createEditorState());
  logMessage('info', 'New empty scene.');
}

export async function openSceneDialog() {
  if (!confirmDiscard()) return;
  try {
    const names = await listScenes();
    openList.replaceChildren();
    if (names.length === 0) openList.append(element('p', 'note', 'No scenes in the scenes folder yet.'));
    for (const name of names) {
      openList.append(
        button(name, () => {
          openDialog.close();
          void openScene(name);
        })
      );
    }
    openDialog.showModal();
  } catch (error) {
    logMessage('error', describe(error));
  }
}

export function initIo() {
  byId('open-cancel').addEventListener('click', () => openDialog.close());
  window.addEventListener('beforeunload', event => {
    if (isDirty(session.state) || session.play) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
}
