import {
  addEntity,
  childrenOf,
  createDefaultRegistry,
  descendantIds,
  emptyScene,
  getEntity,
  parseScene,
  removeComponent,
  removeEntity,
  sceneToJson,
  setComponent,
  setField,
  setParent,
  type ComponentData,
  type FieldSpec,
  type FieldValue,
  type Scene
} from '../scene/index';
import { checkpoint, commitScene, createEditorState, redo, replaceScene, selectEntity, undo, type EditorState } from './state';
import { moveEntityBy, pickEntity, type Point } from './picking';
import { drawScene, toWorld, zoomAt, type Camera } from './view';

const registry = createDefaultRegistry();
const DEFAULT_CAMERA: Camera = { x: 0, y: 0, zoom: 60 };
const round = (value: number) => Math.round(value * 1000) / 1000;

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id} in editor.html`);
  return element as T;
}

const canvas = byId<HTMLCanvasElement>('viewport');
const context = canvas.getContext('2d');
if (!context) throw new Error('This browser cannot draw on a canvas.');
const hierarchyEl = byId<HTMLElement>('hierarchy');
const inspectorEl = byId<HTMLElement>('inspector');
const statusEl = byId<HTMLElement>('status');
const fileInput = byId<HTMLInputElement>('file');
const undoButton = byId<HTMLButtonElement>('undo');
const redoButton = byId<HTMLButtonElement>('redo');

function demoScene(): Scene {
  let scene = emptyScene();
  scene = addEntity(scene, {
    id: 'ship',
    components: { transform: { x: -2, y: 1, rotation: 20 }, sprite: { texture: 'ship.png', tint: '#60a5fa' }, collider: { shape: 'box', width: 2, height: 1 } }
  }, registry);
  scene = addEntity(scene, {
    id: 'gun',
    parent: 'ship',
    components: { transform: { x: 1.2, y: 0 }, sprite: { texture: 'gun.png', tint: '#f87171' }, collider: { shape: 'circle', radius: 0.25 } }
  }, registry);
  scene = addEntity(scene, {
    id: 'crate',
    components: { transform: { x: 3, y: -1 }, sprite: { texture: 'crate.png', tint: '#fbbf24' }, collider: { shape: 'box', width: 1.5, height: 1.5 } }
  }, registry);
  return scene;
}

let state: EditorState = createEditorState(demoScene());
let camera: Camera = DEFAULT_CAMERA;
let dragging: { id: string; last: Point; checkpointed: boolean } | null = null;
let panning: { last: Point } | null = null;
let counter = 1;

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function setStatus(message: string, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle('error', isError);
}

function viewSize() {
  const rect = canvas.getBoundingClientRect();
  return { width: rect.width, height: rect.height };
}

function localPoint(event: MouseEvent): Point {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function apply(next: EditorState) {
  state = next;
  render();
}

/** Runs a scene change as one undo step. A failed change shows its message and leaves the scene as it was. */
function change(run: (scene: Scene) => Scene) {
  try {
    const next = run(state.scene);
    apply(commitScene(state, next));
    setStatus('');
  } catch (error) {
    setStatus(describe(error), true);
    render();
  }
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const node = element('button', undefined, label);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}

function option(value: string, label: string): HTMLOptionElement {
  const node = element('option', undefined, label);
  node.value = value;
  return node;
}

function fieldRow(label: string, control: HTMLElement): HTMLElement {
  const row = element('div', 'field');
  row.append(element('span', 'note', label), control);
  return row;
}

function renderHierarchy() {
  hierarchyEl.replaceChildren();
  const visit = (parent: string | null, depth: number) => {
    for (const entity of childrenOf(state.scene, parent)) {
      const row = element('div', `row${entity.id === state.selected ? ' selected' : ''}`, entity.id);
      row.style.paddingLeft = `${10 + depth * 14}px`;
      row.draggable = true;
      row.addEventListener('click', () => apply(selectEntity(state, entity.id)));
      row.addEventListener('dragstart', event => event.dataTransfer?.setData('text/plain', entity.id));
      row.addEventListener('dragover', event => event.preventDefault());
      row.addEventListener('drop', event => {
        event.preventDefault();
        event.stopPropagation();
        const dragged = event.dataTransfer?.getData('text/plain');
        if (dragged) change(scene => setParent(scene, dragged, entity.id));
      });
      hierarchyEl.append(row);
      visit(entity.id, depth + 1);
    }
  };
  visit(null, 0);
  if (state.scene.entities.length === 0) {
    hierarchyEl.append(element('p', 'note', 'The scene is empty. Add an entity from the toolbar.'));
  }
}

function fieldControl(id: string, name: string, field: string, spec: FieldSpec, value: unknown): HTMLElement {
  const commit = (next: FieldValue) => change(scene => setField(scene, id, name, field, next, registry));

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
  control.type = spec.type === 'number' ? 'number' : 'text';
  if (spec.type === 'number') control.step = 'any';
  control.value = String(value);
  control.addEventListener('change', () => {
    if (spec.type === 'number' && control.value.trim() === '') {
      setStatus(`${name}.${field} needs a number.`, true);
      render();
      return;
    }
    commit(spec.type === 'number' ? Number(control.value) : control.value);
  });
  return fieldRow(field, control);
}

function renderInspector() {
  inspectorEl.replaceChildren();
  if (state.selected === null) {
    inspectorEl.append(element('p', 'note', 'Select an entity to see its components.'));
    return;
  }
  const id = state.selected;
  const entity = getEntity(state.scene, id);
  inspectorEl.append(element('div', 'panel-title', id));

  const parentSelect = element('select');
  parentSelect.append(option('', '(root)'));
  const blocked = new Set([id, ...descendantIds(state.scene, id)]);
  for (const other of state.scene.entities) {
    if (!blocked.has(other.id)) parentSelect.append(option(other.id, other.id));
  }
  parentSelect.value = entity.parent ?? '';
  parentSelect.addEventListener('change', () => change(scene => setParent(scene, id, parentSelect.value === '' ? null : parentSelect.value)));
  inspectorEl.append(fieldRow('parent', parentSelect));

  for (const [name, data] of Object.entries(entity.components)) {
    const box = element('div', 'component');
    const head = element('div', 'component-head');
    head.append(element('strong', undefined, name), button('Remove', () => change(scene => removeComponent(scene, id, name))));
    box.append(head);
    const schema = registry.get(name);
    if (!schema) {
      box.append(element('p', 'note', 'No editor schema for this component, so it is kept as data:'));
      const pre = element('pre', undefined, JSON.stringify(data, null, 2));
      box.append(pre);
    } else {
      for (const [field, spec] of Object.entries(schema.fields)) {
        box.append(fieldControl(id, name, field, spec, (data as ComponentData)[field] ?? spec.default));
      }
    }
    inspectorEl.append(box);
  }

  const missing = registry.names().filter(name => !(name in entity.components));
  if (missing.length > 0) {
    const row = element('div', 'add-row');
    const select = element('select');
    for (const name of missing) select.append(option(name, name));
    row.append(select, button('Add component', () => change(scene => setComponent(scene, id, select.value, {}, registry))));
    inspectorEl.append(row);
  }
}

function drawCanvas() {
  drawScene(context!, state.scene, camera, viewSize(), state.selected);
}

function render() {
  renderHierarchy();
  renderInspector();
  undoButton.disabled = state.past.length === 0;
  redoButton.disabled = state.future.length === 0;
  drawCanvas();
}

function addEntityAt(components: Record<string, ComponentData>) {
  let id: string;
  do {
    id = `entity-${counter++}`;
  } while (state.scene.entities.some(entity => entity.id === id));
  change(scene => addEntity(scene, { id, parent: null, components: { transform: { x: round(camera.x), y: round(camera.y) }, ...components } }, registry));
  if (state.scene.entities.some(entity => entity.id === id)) apply(selectEntity(state, id));
}

function resizeCanvas() {
  const { width, height } = viewSize();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  context!.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawCanvas();
}

// Toolbar
byId('new').addEventListener('click', () => change(() => emptyScene()));
byId('open').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  fileInput.value = '';
  if (!file) return;
  try {
    const { scene, warnings } = parseScene(await file.text(), registry);
    apply(commitScene(state, scene));
    setStatus(warnings.length > 0 ? `Opened ${file.name} with ${warnings.length} warning(s): ${warnings.join(' ')}` : `Opened ${file.name}.`);
  } catch (error) {
    setStatus(describe(error), true);
  }
});
byId('save').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([sceneToJson(state.scene, registry)], { type: 'application/json' }));
  const link = element('a');
  link.href = url;
  link.download = 'scene.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setStatus('Saved scene.json to your downloads.');
});
undoButton.addEventListener('click', () => apply(undo(state)));
redoButton.addEventListener('click', () => apply(redo(state)));
byId('add-empty').addEventListener('click', () => addEntityAt({}));
byId('add-sprite').addEventListener('click', () => addEntityAt({ sprite: { texture: '' } }));
byId('add-collider').addEventListener('click', () => addEntityAt({ collider: {} }));
byId('delete').addEventListener('click', () => {
  const selected = state.selected;
  if (selected) change(scene => removeEntity(scene, selected));
});
byId('reset-view').addEventListener('click', () => {
  camera = DEFAULT_CAMERA;
  drawCanvas();
});

// Hierarchy: dropping on empty space makes the entity a root.
hierarchyEl.addEventListener('dragover', event => event.preventDefault());
hierarchyEl.addEventListener('drop', event => {
  event.preventDefault();
  const dragged = event.dataTransfer?.getData('text/plain');
  if (dragged) change(scene => setParent(scene, dragged, null));
});

// Keyboard
window.addEventListener('keydown', event => {
  const target = event.target as HTMLElement | null;
  if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
  const modifier = event.metaKey || event.ctrlKey;
  const key = event.key.toLowerCase();
  if (modifier && key === 'z') {
    event.preventDefault();
    apply(event.shiftKey ? redo(state) : undo(state));
  } else if (modifier && key === 'y') {
    event.preventDefault();
    apply(redo(state));
  } else if ((event.key === 'Delete' || event.key === 'Backspace') && state.selected) {
    event.preventDefault();
    const selected = state.selected;
    change(scene => removeEntity(scene, selected));
  }
});

// Viewport: click to select, drag an entity to move it, drag empty space to pan, scroll to zoom.
canvas.addEventListener('pointerdown', event => {
  canvas.setPointerCapture(event.pointerId);
  const screen = localPoint(event);
  const world = toWorld(camera, viewSize(), screen);
  const hit = pickEntity(state.scene, world);
  apply(selectEntity(state, hit));
  dragging = hit ? { id: hit, last: world, checkpointed: false } : null;
  panning = hit ? null : { last: screen };
});
canvas.addEventListener('pointermove', event => {
  const screen = localPoint(event);
  if (dragging) {
    const world = toWorld(camera, viewSize(), screen);
    try {
      const next = moveEntityBy(state.scene, dragging.id, { x: world.x - dragging.last.x, y: world.y - dragging.last.y }, registry);
      if (!dragging.checkpointed) {
        state = checkpoint(state);
        dragging.checkpointed = true;
      }
      state = replaceScene(state, next);
      dragging.last = world;
      render();
    } catch (error) {
      setStatus(describe(error), true);
      dragging = null;
    }
  } else if (panning) {
    camera = {
      ...camera,
      x: camera.x - (screen.x - panning.last.x) / camera.zoom,
      y: camera.y + (screen.y - panning.last.y) / camera.zoom
    };
    panning.last = screen;
    drawCanvas();
  }
});
const endPointer = () => {
  dragging = null;
  panning = null;
};
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener(
  'wheel',
  event => {
    event.preventDefault();
    camera = zoomAt(camera, viewSize(), localPoint(event), Math.exp(-event.deltaY * 0.0015));
    drawCanvas();
  },
  { passive: false }
);
window.addEventListener('resize', resizeCanvas);

resizeCanvas();
render();
