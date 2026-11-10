// The inspector: the selected entity's name, parent and components, or the selected asset's properties.

import { descendantIds, getEntity, removeComponent, renameEntity, setComponent, setField, setParent, worldTransform, type ComponentData, type FieldSpec, type FieldValue, type Point2 } from '../scene/index';
import { button, byId, element, fieldRow, option } from './dom';
import { apply, blockedWhilePlaying, edit, onRender, render, session, type LiveEdit } from './session';
import { selectEntity } from './state';
import { showPopup, type PopupItem } from './chrome';
import { assetKindOf, assetUrl } from './assets';
import { registry } from './registry';
import { attachScrub, liveEdit } from './scrub';
import { renderAssetInspector } from './asset-inspector';
import { deleteSelected, duplicateSelected } from './scene-actions';
import { describe, logMessage } from './log';
import { format } from './util';

const inspectorEl = byId<HTMLElement>('inspector');

/** A range slider for a number field that has both a min and a max. It stays in step with the number box. */
function rangeControl(control: HTMLInputElement, id: string, name: string, field: string, min: number, max: number): HTMLInputElement {
  const slider = element('input');
  slider.type = 'range';
  slider.min = String(min);
  slider.max = String(max);
  slider.step = 'any';
  slider.value = control.value;
  slider.setAttribute('aria-label', `${field} slider`);
  const fill = () => slider.style.setProperty('--range-progress', `${((Number(slider.value) - min) / (max - min || 1)) * 100}%`);
  fill();
  let live: LiveEdit | null = null;
  slider.addEventListener('input', () => {
    if (blockedWhilePlaying()) return;
    live ??= liveEdit(id, name);
    const value = Number(slider.value);
    try {
      live.set(field, value);
    } catch (error) {
      logMessage('error', describe(error));
      return;
    }
    control.value = format(value);
    fill();
  });
  slider.addEventListener('change', () => {
    live?.finish();
    live = null;
  });
  return slider;
}

function numberControl(id: string, name: string, field: string, spec: FieldSpec, value: unknown): HTMLElement {
  const control = element('input');
  control.type = 'number';
  control.step = 'any';
  control.value = String(value);
  control.addEventListener('keydown', event => {
    if (event.key === 'Enter') control.blur();
  });
  control.addEventListener('change', () => {
    if (control.value.trim() === '') {
      logMessage('error', `${name}.${field} needs a number.`);
      apply(session.state);
      return;
    }
    edit(scene => setField(scene, id, name, field, Number(control.value), registry));
  });
  const bounds = spec as { min?: number; max?: number };
  const wrap = element('div', 'number-field');
  wrap.append(control);
  if (bounds.min !== undefined && bounds.max !== undefined) wrap.append(rangeControl(control, id, name, field, bounds.min, bounds.max));
  const row = fieldRow(field, wrap);
  attachScrub(row.firstElementChild as HTMLElement, control, id, name, field, spec, wrap.querySelector<HTMLInputElement>('input[type=range]') ?? undefined);
  return row;
}

/** Image and sound fields: a thumbnail, a picker, a clear button, and drop-to-assign from the Assets panel. */
function assetControl(id: string, name: string, field: string, spec: { kind: 'image' | 'audio' }, value: unknown): HTMLElement {
  const commit = (next: FieldValue) => edit(scene => setField(scene, id, name, field, next, registry));
  const current = typeof value === 'string' ? value : '';
  const known = session.assets.some(asset => asset.path === current);
  const wrap = element('div', 'asset-field');
  const thumb = element('div', 'asset-thumb');
  if (known && spec.kind === 'image') {
    const image = element('img');
    image.src = assetUrl(current);
    image.alt = '';
    thumb.append(image);
  } else {
    thumb.textContent = spec.kind === 'image' ? '▢' : '♪';
  }
  const control = element('select');
  control.setAttribute('aria-label', field);
  control.append(option('', '(none)'));
  for (const asset of session.assets.filter(item => item.kind === spec.kind)) control.append(option(asset.path, asset.path));
  if (current !== '' && !known) control.append(option(current, `${current} (missing)`));
  control.value = current;
  control.addEventListener('change', () => commit(control.value));
  const clear = button('×', () => commit(''), `Clear ${field}`);
  clear.disabled = current === '';
  wrap.addEventListener('dragover', event => {
    if (!event.dataTransfer?.types.includes('application/x-asset')) return;
    event.preventDefault();
    wrap.classList.add('drop-ready');
  });
  wrap.addEventListener('dragleave', event => {
    if (!wrap.contains(event.relatedTarget as Node | null)) wrap.classList.remove('drop-ready');
  });
  wrap.addEventListener('drop', event => {
    wrap.classList.remove('drop-ready');
    const path = event.dataTransfer?.getData('application/x-asset');
    if (!path) return;
    event.preventDefault();
    const kind = assetKindOf(path);
    if (kind !== spec.kind) {
      logMessage('warn', `${path} is ${kind ? `an ${kind}` : 'not a supported asset'}. ${field} needs ${spec.kind === 'image' ? 'an image' : 'a sound'}.`);
      return;
    }
    commit(path);
  });
  wrap.append(thumb, control, clear);
  return fieldRow(field, wrap);
}

/** A colour: a swatch that opens the browser colour picker, and the hex code typed or copied. Both stay in step. */
function colorControl(id: string, name: string, field: string, value: string): HTMLElement {
  const wrap = element('div', 'color-field');
  const swatch = element('input');
  swatch.type = 'color';
  swatch.value = value;
  swatch.setAttribute('aria-label', `${field} colour`);
  const hex = element('input', 'hex-input');
  hex.type = 'text';
  hex.value = value;
  hex.maxLength = 7;
  hex.spellcheck = false;
  let live: LiveEdit | null = null;
  swatch.addEventListener('input', () => {
    if (blockedWhilePlaying()) return;
    live ??= liveEdit(id, name);
    hex.value = swatch.value;
    try {
      live.set(field, swatch.value);
    } catch (error) {
      logMessage('error', describe(error));
    }
  });
  swatch.addEventListener('change', () => {
    live?.finish();
    live = null;
  });
  hex.addEventListener('change', () => {
    if (/^#[0-9a-f]{6}$/i.test(hex.value)) edit(scene => setField(scene, id, name, field, hex.value.toLowerCase(), registry));
    else {
      logMessage('error', `${field} needs a colour such as #ff8800.`);
      render();
    }
  });
  wrap.append(swatch, hex);
  return fieldRow(field, wrap);
}

/** Polygon corners are edited in the viewport. Here you see how many there are, and can reset them. */
function pointsControl(id: string, name: string, field: string, fallback: readonly Point2[], points: readonly Point2[]): HTMLElement {
  const wrap = element('div', 'points-field');
  wrap.append(
    element('span', 'note', `${points.length} corners · drag them in the view`),
    button('Reset', () => edit(scene => setField(scene, id, name, field, fallback, registry)), 'Reset to the default triangle')
  );
  return fieldRow(field, wrap);
}

/** One editable field, chosen by its schema type. */
function fieldControl(id: string, name: string, field: string, spec: FieldSpec, value: unknown): HTMLElement {
  const commit = (next: FieldValue) => edit(scene => setField(scene, id, name, field, next, registry));
  if (spec.type === 'asset') return assetControl(id, name, field, spec, value);
  if (spec.type === 'number') return numberControl(id, name, field, spec, value);
  if (spec.type === 'color') return colorControl(id, name, field, String(value));
  if (spec.type === 'points') return pointsControl(id, name, field, spec.default, (value as readonly Point2[]) ?? []);
  if (spec.type === 'boolean') {
    const control = element('input');
    control.type = 'checkbox';
    control.checked = value === true;
    control.addEventListener('change', () => commit(control.checked));
    return fieldRow(field, control);
  }
  if (spec.type === 'enum') {
    const control = element('select');
    for (const choice of spec.options) control.append(option(choice, choice));
    control.value = String(value);
    control.addEventListener('change', () => commit(control.value));
    return fieldRow(field, control);
  }
  const control = element('input');
  control.type = 'text';
  control.value = String(value);
  control.addEventListener('keydown', event => {
    if (event.key === 'Enter') control.blur();
  });
  control.addEventListener('change', () => commit(control.value));
  return fieldRow(field, control);
}

/** The entity's name, parent, actions, and one box per component. */
function renderEntity(id: string) {
  const entity = getEntity(session.state.scene, id);
  const world = worldTransform(session.state.scene, id);

  const name = element('input', 'name-input');
  name.value = id;
  name.setAttribute('aria-label', 'Entity name');
  name.addEventListener('keydown', event => {
    if (event.key === 'Enter') name.blur();
  });
  name.addEventListener('change', () => {
    const next = name.value.trim();
    if (next === id) return;
    edit(scene => renameEntity(scene, id, next));
    if (session.state.scene.entities.some(other => other.id === next)) apply(selectEntity(session.state, next));
  });
  inspectorEl.append(name, element('p', 'note', `World position ${format(world.x)}, ${format(world.y)}`));

  const parentSelect = element('select');
  parentSelect.append(option('', '(root)'));
  const blocked = new Set([id, ...descendantIds(session.state.scene, id)]);
  for (const other of session.state.scene.entities) {
    if (!blocked.has(other.id)) parentSelect.append(option(other.id, other.id));
  }
  parentSelect.value = entity.parent ?? '';
  parentSelect.addEventListener('change', () => edit(scene => setParent(scene, id, parentSelect.value === '' ? null : parentSelect.value)));
  inspectorEl.append(fieldRow('parent', parentSelect));

  const actions = element('div', 'actions');
  actions.append(button('Duplicate', duplicateSelected, 'Duplicate (Ctrl+D)'), button('Delete', deleteSelected, 'Delete (Del)'));
  inspectorEl.append(actions);

  for (const [componentName, data] of Object.entries(entity.components)) {
    const box = element('div', 'component');
    box.dataset.kind = componentName;
    const head = element('div', 'component-head');
    head.append(element('strong', undefined, componentName), button('Remove', () => edit(scene => removeComponent(scene, id, componentName))));
    box.append(head);
    const schema = registry.get(componentName);
    if (!schema) {
      box.append(element('p', 'note', 'No editor schema for this component, so it is kept as data:'), element('pre', undefined, JSON.stringify(data, null, 2)));
    } else {
      for (const [field, spec] of Object.entries(schema.fields)) {
        box.append(fieldControl(id, componentName, field, spec, (data as ComponentData)[field] ?? spec.default));
      }
    }
    inspectorEl.append(box);
  }

  const missing = registry.names().filter(name => !(name in entity.components));
  if (missing.length > 0) {
    const row = element('div', 'add-row');
    const add: HTMLButtonElement = button('Add component…', () =>
      showPopup(
        add,
        missing.map((name): PopupItem => ({ label: name, run: () => edit(scene => setComponent(scene, id, name, {}, registry)) }))
      ), 'Add a component to this entity');
    row.append(add);
    inspectorEl.append(row);
  }
}

export function renderInspector() {
  inspectorEl.replaceChildren();
  if (session.play) inspectorEl.append(element('p', 'warn-note', 'Play mode is on. Values shown are the scene’s; stop play to edit.'));
  if (session.selectedAsset) {
    const asset = session.assets.find(item => item.path === session.selectedAsset);
    if (asset) return renderAssetInspector(inspectorEl, asset);
  }
  if (session.state.selected === null) {
    inspectorEl.append(element('p', 'note hint', 'Select an entity to edit it. Drag a sprite from Assets onto a Texture field, or into the view to place it.'));
    return;
  }
  renderEntity(session.state.selected);
}

export function initInspector() {
  onRender(renderInspector);
}
