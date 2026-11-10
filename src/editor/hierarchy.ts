// The hierarchy panel: the scene's entities as a tree. Drag to re-parent, right-click for actions.

import { childrenOf, setParent } from '../scene/index';
import { byId, element } from './dom';
import { apply, edit, onRender, session } from './session';
import { selectEntity } from './state';
import { showPopup, MOD, type PopupItem } from './chrome';
import { addEntityAt, deleteSelected, duplicateSelected } from './scene-actions';

const hierarchyEl = byId<HTMLElement>('hierarchy');

function hierarchyMenu(id: string): PopupItem[] {
  return [
    { label: 'Create empty child', run: () => addEntityAt({}, 'entity', undefined, id) },
    { label: 'Create sprite child', run: () => addEntityAt({ sprite: { texture: '' } }, 'sprite', undefined, id) },
    { label: 'Duplicate', shortcut: `${MOD}D`, run: duplicateSelected, separatorBefore: true },
    { label: 'Rename', run: () => setTimeout(() => byId<HTMLElement>('inspector').querySelector<HTMLInputElement>('.name-input')?.select(), 0) },
    { label: 'Delete', shortcut: 'Del', run: deleteSelected }
  ];
}

function renderHierarchy() {
  hierarchyEl.replaceChildren();
  const visit = (parent: string | null, depth: number) => {
    for (const entity of childrenOf(session.state.scene, parent)) {
      const row = element('div', `row${entity.id === session.state.selected ? ' selected' : ''}`, entity.id);
      row.title = entity.id;
      row.style.paddingLeft = `${10 + depth * 14}px`;
      row.draggable = true;
      row.addEventListener('click', () => apply(selectEntity(session.state, entity.id)));
      row.addEventListener('contextmenu', event => {
        event.preventDefault();
        if (session.state.selected !== entity.id) apply(selectEntity(session.state, entity.id));
        showPopup({ x: event.clientX, y: event.clientY }, hierarchyMenu(entity.id));
      });
      row.addEventListener('dragstart', event => event.dataTransfer?.setData('text/plain', entity.id));
      row.addEventListener('dragover', event => event.preventDefault());
      row.addEventListener('drop', event => {
        event.preventDefault();
        event.stopPropagation();
        const dragged = event.dataTransfer?.getData('text/plain');
        if (dragged) edit(scene => setParent(scene, dragged, entity.id));
      });
      hierarchyEl.append(row);
      visit(entity.id, depth + 1);
    }
  };
  visit(null, 0);
  if (session.state.scene.entities.length === 0) {
    hierarchyEl.append(element('p', 'note hint', 'No entities yet. Use Add in the toolbar, or right-click here.'));
  }
  hierarchyEl.querySelector('.row.selected')?.scrollIntoView({ block: 'nearest' });
}

export function initHierarchy() {
  onRender(renderHierarchy);
  hierarchyEl.addEventListener('contextmenu', event => {
    if ((event.target as HTMLElement).closest('.row')) return;
    event.preventDefault();
    showPopup({ x: event.clientX, y: event.clientY }, [{ label: 'Create empty', shortcut: `${MOD}⇧N`, run: () => addEntityAt({}) }]);
  });
  // Dropping on empty space makes the entity a root.
  hierarchyEl.addEventListener('dragover', event => event.preventDefault());
  hierarchyEl.addEventListener('drop', event => {
    event.preventDefault();
    const dragged = event.dataTransfer?.getData('text/plain');
    if (dragged) edit(scene => setParent(scene, dragged, null));
  });
}
