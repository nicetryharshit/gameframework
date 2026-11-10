import './shell';
import { flappyBirdSchema } from '../flappy-schema';
import {
  addEntity,
  childrenOf,
  createDefaultRegistry,
  createSceneRuntime,
  descendantIds,
  duplicateEntity,
  emptyScene,
  getEntity,
  parseScene,
  readTransform,
  removeComponent,
  removeEntity,
  renameEntity,
  sceneToJson,
  setComponent,
  setField,
  setParent,
  worldTransform,
  type ComponentData,
  type FieldSpec,
  type FieldValue,
  type Scene,
  type SceneRuntime
} from '../scene/index';
import { assetKindOf, assetUrl, createAudio, ImageCache, listAssets, listScenes, readScene, uploadAsset, writeScene, type AssetInfo } from './assets';
import { checkpoint, commitScene, createEditorState, isDirty, markSaved, redo, replaceScene, selectEntity, undo, type EditorState } from './state';
import { localDeltaFor, moveEntityBy, pickEntity, setPosition, type Point } from './picking';
import { DARK_VIEW_PALETTE, drawScene, toWorld, zoomAt, type Camera, type ViewPalette } from './view';
import { addCommands, commandItems, MOD, setButton, showPopup, type PopupItem } from './chrome';

const registry = createDefaultRegistry().register(flappyBirdSchema);
const DEFAULT_CAMERA: Camera = { x: 0, y: 0, zoom: 60 };
const NUDGE_STEP = 0.1;
const MAX_LOG_ENTRIES = 300;
const round = (value: number) => Math.round(value * 1000) / 1000;
const format = (value: number) => String(round(value));

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
const assetsEl = byId<HTMLElement>('assets');
const assetPreviewEl = byId<HTMLElement>('asset-preview');
const consoleEl = byId<HTMLElement>('console');
const overlayName = byId<HTMLElement>('scene-name');
const cursorEl = byId<HTMLElement>('cursor');
const metaEl = byId<HTMLElement>('meta');
const playBanner = byId<HTMLElement>('play-banner');
const undoButton = byId<HTMLButtonElement>('undo');
const redoButton = byId<HTMLButtonElement>('redo');
const playButton = byId<HTMLButtonElement>('play');
const pauseButton = byId<HTMLButtonElement>('pause');
const openDialog = byId<HTMLDialogElement>('open-dialog');
const openList = byId<HTMLElement>('open-list');
const importInput = byId<HTMLInputElement>('import');

function demoScene(): Scene {
  let scene = emptyScene();
  scene = addEntity(scene, {
    id: 'ship',
    components: { transform: { x: -2, y: 1, rotation: 20 }, sprite: { texture: 'images/ship.svg', width: 1.6, height: 1.6 } }
  }, registry);
  scene = addEntity(scene, {
    id: 'crate',
    components: { transform: { x: 3, y: -1 }, sprite: { texture: 'images/crate.svg' }, collider: { shape: 'box', width: 1, height: 1 } }
  }, registry);
  return scene;
}

let state: EditorState = createEditorState(demoScene());
let sceneName: string | null = null;
let camera: Camera = DEFAULT_CAMERA;
let snap = 0;
let hovered: string | null = null;
let dragging: { id: string; origin: Point; start: Point; checkpointed: boolean } | null = null;
let panning: { last: Point } | null = null;
let assets: AssetInfo[] = [];
let selectedAsset: string | null = null;
let counter = 1;
let play: { runtime: SceneRuntime; last: number; frame: number; paused: boolean } | null = null;

type Level = 'info' | 'warn' | 'error';

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Adds a line to the console. A link, such as a download, is optional. */
function logMessage(level: Level, message: string, link?: { href: string; label: string }) {
  const entry = element('div', `entry ${level}`);
  entry.append(element('span', 'time', new Date().toLocaleTimeString()), element('span', 'text', message));
  if (link) {
    const anchor = element('a', undefined, link.label);
    anchor.href = link.href;
    anchor.download = '';
    entry.append(anchor);
  }
  consoleEl.append(entry);
  while (consoleEl.childElementCount > MAX_LOG_ENTRIES) consoleEl.firstElementChild?.remove();
  consoleEl.scrollTop = consoleEl.scrollHeight;
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

/** True while play mode runs. Edits are refused then, so the scene the runtime plays stays the same. */
function blockedWhilePlaying(): boolean {
  if (!play) return false;
  logMessage('warn', 'Stop play mode to edit. Edits are not allowed while the scene is playing.');
  return true;
}

/** Runs a scene change as one undo step. A failed change is logged and the scene is left as it was. */
function edit(run: (scene: Scene) => Scene) {
  if (blockedWhilePlaying()) {
    render();
    return;
  }
  try {
    apply(commitScene(state, run(state.scene)));
  } catch (error) {
    logMessage('error', describe(error));
    render();
  }
}

function confirmDiscard(): boolean {
  return !isDirty(state) || window.confirm('You have unsaved changes. Discard them?');
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(label: string, onClick: () => void, title?: string): HTMLButtonElement {
  const node = element('button', undefined, label);
  node.type = 'button';
  if (title) node.title = title;
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

/** A fresh id such as "crate-3" that no entity uses yet. */
function freshId(base: string): string {
  const stem = base.replace(/\.[a-z0-9]+$/i, '').replace(/[^A-Za-z0-9_-]+/g, '-') || 'entity';
  let id: string;
  do {
    id = `${stem}-${counter++}`;
  } while (state.scene.entities.some(entity => entity.id === id));
  return id;
}

async function save() {
  let name = sceneName;
  if (!name) {
    const answer = window.prompt('Scene name (lowercase letters, numbers and dashes)', 'level-1');
    if (!answer) return;
    name = answer.trim().toLowerCase();
  }
  try {
    const result = await writeScene(name, sceneToJson(state.scene, registry));
    sceneName = name;
    apply(markSaved(state));
    logMessage('info', `Saved ${result.path}.`, { href: result.downloadUrl, label: 'Download' });
  } catch (error) {
    logMessage('error', `Could not save: ${describe(error)}`);
  }
}

/** Downloads the scene as it is now, saved or not, without touching the project. */
function downloadCurrent() {
  const url = URL.createObjectURL(new Blob([sceneToJson(state.scene, registry)], { type: 'application/json' }));
  const link = element('a');
  link.href = url;
  link.download = `${sceneName ?? 'scene'}.scene.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  logMessage('info', `Downloaded ${link.download}.`);
}

async function openScene(name: string) {
  try {
    const { scene, warnings } = parseScene(await readScene(name), registry);
    sceneName = name;
    apply(createEditorState(scene));
    logMessage('info', `Opened scenes/${name}.scene.json.`);
    for (const warning of warnings) logMessage('warn', warning);
  } catch (error) {
    logMessage('error', describe(error));
  }
}

/** Creates an entity. A child is placed at its parent's origin, so its position is local to the parent. */
function addEntityAt(components: Record<string, ComponentData>, base = 'entity', at?: Point, parent: string | null = null) {
  const id = freshId(base);
  const position = parent !== null ? { x: 0, y: 0 } : at ?? camera;
  edit(scene => addEntity(scene, { id, parent, components: { transform: { x: round(position.x), y: round(position.y) }, ...components } }, registry));
  if (state.scene.entities.some(entity => entity.id === id)) apply(selectEntity(state, id));
}

function duplicateSelected() {
  const source = state.selected;
  if (!source) return;
  const id = freshId(`${source}-copy`);
  edit(scene => duplicateEntity(scene, source, id, registry));
  if (state.scene.entities.some(entity => entity.id === id)) apply(selectEntity(state, id));
}

function deleteSelected() {
  const id = state.selected;
  if (id) edit(scene => removeEntity(scene, id));
}

function nudge(dx: number, dy: number) {
  const id = state.selected;
  if (!id || blockedWhilePlaying()) return;
  try {
    apply(commitScene(state, moveEntityBy(state.scene, id, { x: dx, y: dy }, registry, snap)));
  } catch (error) {
    logMessage('error', describe(error));
  }
}

function focusSelected() {
  const id = state.selected;
  if (!id) return;
  const world = worldTransform(state.scene, id);
  camera = { ...camera, x: world.x, y: world.y };
  drawCanvas();
}

// Play mode: a runtime built from the current scene. Stopping drops the runtime, and the scene is unchanged.

function startPlay() {
  if (play) return;
  try {
    const runtime = createSceneRuntime(state.scene, {
      createAudio: createAudio(message => logMessage('error', message)),
      onWarning: message => logMessage('warn', message)
    });
    play = { runtime, last: performance.now(), frame: 0, paused: false };
    play.frame = requestAnimationFrame(tick);
    logMessage('info', 'Play mode started. Edits are locked until you stop.');
  } catch (error) {
    logMessage('error', `Could not start play mode: ${describe(error)}`);
  }
  hovered = null;
  updatePlayUi();
  render();
}

function stopPlay() {
  const current = play;
  if (!current) return;
  cancelAnimationFrame(current.frame);
  current.runtime.dispose();
  play = null;
  logMessage('info', 'Play mode stopped. The scene is back to how it was before play.');
  updatePlayUi();
  render();
}

function togglePlay() {
  if (play) stopPlay();
  else startPlay();
}

function togglePause() {
  if (!play) return;
  play.paused = !play.paused;
  updatePlayUi();
}

function tick(now: number) {
  const current = play;
  if (!current) return;
  const seconds = Math.min(0.1, (now - current.last) / 1000);
  current.last = now;
  if (!current.paused) current.runtime.advance(seconds);
  drawCanvas();
  current.frame = requestAnimationFrame(tick);
}

function updatePlayUi() {
  setButton(playButton, play ? 'Stop' : 'Play', play ? 'stop' : 'play');
  playButton.classList.toggle('active', play !== null);
  pauseButton.disabled = play === null;
  setButton(pauseButton, play?.paused ? 'Resume' : 'Pause', play?.paused ? 'play' : 'pause');
  playBanner.hidden = play === null;
  playBanner.textContent = play?.paused ? 'PAUSED' : 'PLAYING';
  document.body.classList.toggle('playing', play !== null);
}

const images = new ImageCache(() => drawCanvas());

/** Reads the viewport colours from the theme's tokens, so the canvas follows light and dark. */
function readPalette(): ViewPalette {
  const style = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    background: read('--canvas-bg', DARK_VIEW_PALETTE.background),
    playBackground: read('--canvas-play', DARK_VIEW_PALETTE.playBackground),
    grid: read('--canvas-grid', DARK_VIEW_PALETTE.grid),
    axis: read('--canvas-axis', DARK_VIEW_PALETTE.axis),
    link: read('--canvas-link', DARK_VIEW_PALETTE.link),
    outline: read('--canvas-outline', DARK_VIEW_PALETTE.outline),
    selected: read('--canvas-selected', DARK_VIEW_PALETTE.selected),
    hovered: read('--canvas-hovered', DARK_VIEW_PALETTE.hovered),
    origin: read('--canvas-origin', DARK_VIEW_PALETTE.origin),
    label: read('--canvas-label', DARK_VIEW_PALETTE.label),
    muted: read('--canvas-muted', DARK_VIEW_PALETTE.muted),
    sprite: read('--canvas-sprite', DARK_VIEW_PALETTE.sprite)
  };
}

let viewPalette: ViewPalette = readPalette();

function drawCanvas() {
  const image = (path: string) => images.get(path);
  if (play) drawScene(context!, state.scene, camera, viewSize(), { worlds: play.runtime.worlds, image, gizmos: false, palette: viewPalette });
  else drawScene(context!, state.scene, camera, viewSize(), { selected: state.selected, hovered, image, gizmos: true, palette: viewPalette });
}

function fieldControl(id: string, name: string, field: string, spec: FieldSpec, value: unknown): HTMLElement {
  const commit = (next: FieldValue) => edit(scene => setField(scene, id, name, field, next, registry));

  if (spec.type === 'asset') {
    const current = typeof value === 'string' ? value : '';
    const choices = assets.filter(asset => asset.kind === spec.kind);
    const known = assets.some(asset => asset.path === current);
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
    for (const asset of choices) control.append(option(asset.path, asset.path));
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
    const container = element('div');
    container.append(fieldRow(field, wrap));
    if (current !== '' && !known) container.append(element('p', 'warn-note', `"${current}" is not in the assets folder.`));
    return container;
  }
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
  control.addEventListener('keydown', event => {
    if (event.key === 'Enter') control.blur();
  });
  control.addEventListener('change', () => {
    if (spec.type === 'number' && control.value.trim() === '') {
      logMessage('error', `${name}.${field} needs a number.`);
      render();
      return;
    }
    commit(spec.type === 'number' ? Number(control.value) : control.value);
  });
  return fieldRow(field, control);
}

function renderHierarchy() {
  hierarchyEl.replaceChildren();
  const visit = (parent: string | null, depth: number) => {
    for (const entity of childrenOf(state.scene, parent)) {
      const row = element('div', `row${entity.id === state.selected ? ' selected' : ''}`, entity.id);
      row.title = entity.id;
      row.style.paddingLeft = `${10 + depth * 14}px`;
      row.draggable = true;
      row.addEventListener('click', () => apply(selectEntity(state, entity.id)));
      row.addEventListener('contextmenu', event => {
        event.preventDefault();
        if (state.selected !== entity.id) apply(selectEntity(state, entity.id));
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
  if (state.scene.entities.length === 0) {
    hierarchyEl.append(element('p', 'note hint', 'No entities yet. Use Add in the toolbar, or right-click here.'));
  }
  hierarchyEl.querySelector('.row.selected')?.scrollIntoView({ block: 'nearest' });
}

function renderInspector() {
  inspectorEl.replaceChildren();
  if (play) inspectorEl.append(element('p', 'warn-note', 'Play mode is on. Values shown are the scene’s; stop play to edit.'));
  if (state.selected === null) {
    inspectorEl.append(element('p', 'note hint', 'Select an entity to edit it. Drag a sprite from Assets onto a Texture field, or into the view to place it.'));
    return;
  }
  const id = state.selected;
  const entity = getEntity(state.scene, id);
  const world = worldTransform(state.scene, id);

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
    if (state.scene.entities.some(other => other.id === next)) apply(selectEntity(state, next));
  });
  inspectorEl.append(name, element('p', 'note', `World position ${format(world.x)}, ${format(world.y)}`));

  const parentSelect = element('select');
  parentSelect.append(option('', '(root)'));
  const blocked = new Set([id, ...descendantIds(state.scene, id)]);
  for (const other of state.scene.entities) {
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

function renderAssets() {
  assetsEl.replaceChildren();
  if (assets.length === 0) {
    assetsEl.append(element('p', 'note hint', 'No assets yet. Import images or sounds, or drop files here. They are stored in assets/images and assets/audio.'));
  }
  for (const kind of ['image', 'audio'] as const) {
    const group = assets.filter(asset => asset.kind === kind);
    if (group.length === 0) continue;
    assetsEl.append(element('div', 'group', kind === 'image' ? 'Images' : 'Audio'));
    for (const asset of group) {
      const row = element('div', `asset${asset.path === selectedAsset ? ' selected' : ''}`);
      row.title = asset.path;
      row.draggable = true;
      if (kind === 'image') {
        const thumb = element('img', 'thumb');
        thumb.src = assetUrl(asset.path);
        thumb.alt = '';
        row.append(thumb);
      } else {
        row.append(element('span', 'thumb audio-icon', '♪'));
      }
      row.append(element('span', 'asset-name', asset.path));
      row.addEventListener('click', () => {
        selectedAsset = asset.path;
        renderAssets();
      });
      row.addEventListener('dragstart', event => {
        event.dataTransfer?.setData('application/x-asset', asset.path);
        event.dataTransfer?.setData('text/plain', asset.path);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
      });
      assetsEl.append(row);
    }
  }
  renderPreview();
}

function renderPreview() {
  assetPreviewEl.replaceChildren();
  const asset = assets.find(item => item.path === selectedAsset);
  if (!asset) return;
  assetPreviewEl.append(element('div', 'note', `${asset.path} · ${Math.max(1, Math.round(asset.size / 1024))} KB`));
  if (asset.kind === 'image') {
    const image = element('img', 'preview');
    image.src = assetUrl(asset.path);
    image.alt = asset.path;
    assetPreviewEl.append(image);
  } else {
    const player = element('audio');
    player.controls = true;
    player.src = assetUrl(asset.path);
    assetPreviewEl.append(player);
  }
}

async function refreshAssets() {
  try {
    assets = await listAssets();
    renderAssets();
    render();
  } catch (error) {
    logMessage('error', `Could not read the assets folder: ${describe(error)}`);
  }
}

async function importFiles(files: File[]) {
  for (const file of files) {
    const kind = assetKindOf(file.name);
    if (!kind) {
      logMessage('error', `${file.name} is not a supported image or sound file.`);
      continue;
    }
    const folder = kind === 'image' ? 'images' : 'audio';
    const name = file.name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
    try {
      const info = await uploadAsset(`${folder}/${name}`, file);
      images.invalidate(info.path);
      selectedAsset = info.path;
      logMessage('info', `Imported assets/${info.path}.`);
    } catch (error) {
      logMessage('error', describe(error));
    }
  }
  await refreshAssets();
}

function renderMeta() {
  const dirty = isDirty(state);
  overlayName.textContent = `${sceneName ? `scenes/${sceneName}.scene.json` : 'Unsaved scene'}${dirty ? ' *' : ''}`;
  metaEl.textContent = `${snap > 0 ? `snap ${snap}` : 'snap off'} · zoom ${Math.round(camera.zoom)} px/unit · ${state.scene.entities.length} entities`;
}

function render() {
  renderHierarchy();
  renderInspector();
  undoButton.disabled = state.past.length === 0;
  redoButton.disabled = state.future.length === 0;
  renderMeta();
  drawCanvas();
}

function resizeCanvas() {
  const { width, height } = viewSize();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  context!.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawCanvas();
}

// Toolbar and dialogs. Menus, the Add dropdown and command search all call the same commands below.
function newScene() {
  if (!confirmDiscard()) return;
  sceneName = null;
  apply(createEditorState());
  logMessage('info', 'New empty scene.');
}

async function openSceneDialog() {
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

const hasSelection = () => state.selected !== null;

function setSnap(step: number) {
  snap = step;
  render();
}

function resetView() {
  camera = DEFAULT_CAMERA;
  drawCanvas();
}

/** Right-click on an entity. Creating a child is what "give it things" usually means, so it comes first. */
function hierarchyMenu(id: string): PopupItem[] {
  return [
    { label: 'Create empty child', run: () => addEntityAt({}, 'entity', undefined, id) },
    { label: 'Create sprite child', run: () => addEntityAt({ sprite: { texture: '' } }, 'sprite', undefined, id) },
    { label: 'Duplicate', shortcut: `${MOD}D`, run: duplicateSelected, separatorBefore: true },
    { label: 'Rename', run: () => setTimeout(() => inspectorEl.querySelector<HTMLInputElement>('.name-input')?.select(), 0) },
    { label: 'Delete', shortcut: 'Del', run: deleteSelected }
  ];
}

byId('add-button').addEventListener('click', event => showPopup(event.currentTarget as HTMLElement, commandItems('Entity')));
undoButton.addEventListener('click', () => apply(undo(state)));
redoButton.addEventListener('click', () => apply(redo(state)));
playButton.addEventListener('click', togglePlay);
pauseButton.addEventListener('click', togglePause);
byId('save').addEventListener('click', () => void save());
byId('clear-console').addEventListener('click', () => consoleEl.replaceChildren());
byId('import-assets').addEventListener('click', () => importInput.click());
byId('open-cancel').addEventListener('click', () => openDialog.close());
importInput.addEventListener('change', () => {
  const files = Array.from(importInput.files ?? []);
  importInput.value = '';
  void importFiles(files);
});
window.addEventListener('themechange', () => {
  viewPalette = readPalette();
  render();
});

addCommands([
  { menu: 'File', label: 'New scene', group: 1, run: newScene },
  { menu: 'File', label: 'Open scene…', group: 1, run: () => void openSceneDialog() },
  { menu: 'File', label: 'Save', shortcut: `${MOD}S`, group: 2, run: () => void save() },
  { menu: 'File', label: 'Download scene file', group: 2, run: downloadCurrent },
  { menu: 'File', label: 'Import assets…', group: 3, run: () => importInput.click() },
  { menu: 'Edit', label: 'Undo', shortcut: `${MOD}Z`, group: 1, enabled: () => state.past.length > 0, run: () => apply(undo(state)) },
  { menu: 'Edit', label: 'Redo', shortcut: `${MOD}⇧Z`, group: 1, enabled: () => state.future.length > 0, run: () => apply(redo(state)) },
  { menu: 'Edit', label: 'Duplicate', shortcut: `${MOD}D`, group: 2, enabled: hasSelection, run: duplicateSelected },
  { menu: 'Edit', label: 'Delete', shortcut: 'Del', group: 2, enabled: hasSelection, run: deleteSelected },
  { menu: 'Edit', label: 'Focus selection', shortcut: 'F', group: 3, enabled: hasSelection, run: focusSelected },
  { menu: 'Entity', label: 'Create empty', shortcut: `${MOD}⇧N`, group: 1, run: () => addEntityAt({}) },
  { menu: 'Entity', label: 'Create sprite', group: 1, run: () => addEntityAt({ sprite: { texture: '' } }, 'sprite') },
  { menu: 'Entity', label: 'Create collider', group: 1, run: () => addEntityAt({ collider: {} }, 'collider') },
  { menu: 'Entity', label: 'Create audio source', group: 1, run: () => addEntityAt({ audio: {} }, 'sound') },
  { menu: 'Entity', label: 'Create child of selection', group: 2, enabled: hasSelection, run: () => addEntityAt({}, 'entity', undefined, state.selected) },
  { menu: 'Play', label: 'Play / stop', shortcut: `${MOD}P`, group: 1, run: togglePlay },
  { menu: 'Play', label: 'Pause / resume', group: 1, enabled: () => play !== null, run: togglePause },
  { menu: 'View', label: 'Reset view', group: 1, run: resetView },
  { menu: 'View', label: 'Clear console', group: 1, run: () => consoleEl.replaceChildren() },
  { menu: 'View', label: 'Snap off', group: 2, checked: () => snap === 0, run: () => setSnap(0) },
  { menu: 'View', label: 'Snap 0.1', group: 2, checked: () => snap === 0.1, run: () => setSnap(0.1) },
  { menu: 'View', label: 'Snap 0.25', group: 2, checked: () => snap === 0.25, run: () => setSnap(0.25) },
  { menu: 'View', label: 'Snap 0.5', group: 2, checked: () => snap === 0.5, run: () => setSnap(0.5) },
  { menu: 'View', label: 'Snap 1', group: 2, checked: () => snap === 1, run: () => setSnap(1) }
]);

// Assets panel: dropping files imports them.
assetsEl.addEventListener('dragover', event => {
  if (event.dataTransfer?.types.includes('Files')) event.preventDefault();
});
assetsEl.addEventListener('drop', event => {
  if (!event.dataTransfer?.files.length) return;
  event.preventDefault();
  void importFiles(Array.from(event.dataTransfer.files));
});

hierarchyEl.addEventListener('contextmenu', event => {
  if ((event.target as HTMLElement).closest('.row')) return;
  event.preventDefault();
  showPopup({ x: event.clientX, y: event.clientY }, [{ label: 'Create empty', shortcut: `${MOD}⇧N`, run: () => addEntityAt({}) }]);
});

// Hierarchy: dropping on empty space makes the entity a root.
hierarchyEl.addEventListener('dragover', event => event.preventDefault());
hierarchyEl.addEventListener('drop', event => {
  event.preventDefault();
  const dragged = event.dataTransfer?.getData('text/plain');
  if (dragged) edit(scene => setParent(scene, dragged, null));
});

// Keyboard: shortcuts do nothing while typing in a field, except Ctrl+P which always toggles play.
window.addEventListener('keydown', event => {
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
      apply(event.shiftKey ? redo(state) : undo(state));
    } else if (key === 'y') {
      event.preventDefault();
      apply(redo(state));
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
    if (play) stopPlay();
    else apply(selectEntity(state, null));
    return;
  }
  if (event.key === 'Delete' || event.key === 'Backspace') {
    if (state.selected) {
      event.preventDefault();
      deleteSelected();
    }
    return;
  }
  if (key === 'f') {
    focusSelected();
    return;
  }
  const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
  const direction = arrows[event.key];
  if (direction && state.selected) {
    event.preventDefault();
    const step = event.shiftKey ? 1 : snap > 0 ? snap : NUDGE_STEP;
    nudge(direction[0] * step, direction[1] * step);
  }
});

// Viewport: click to select, drag to move, drag empty space to pan, scroll to zoom, drop an asset to place it.
canvas.addEventListener('dragover', event => {
  if (event.dataTransfer?.types.includes('application/x-asset')) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }
});
canvas.addEventListener('drop', event => {
  const path = event.dataTransfer?.getData('application/x-asset');
  if (!path) return;
  event.preventDefault();
  const world = toWorld(camera, viewSize(), localPoint(event));
  const kind = assetKindOf(path);
  const base = path.split('/').pop() ?? 'entity';
  if (kind === 'image') addEntityAt({ sprite: { texture: path } }, base, world);
  if (kind === 'audio') addEntityAt({ audio: { clip: path } }, base, world);
});
canvas.addEventListener('pointerdown', event => {
  canvas.setPointerCapture(event.pointerId);
  const screen = localPoint(event);
  if (play) {
    dragging = null;
    panning = { last: screen };
    return;
  }
  const world = toWorld(camera, viewSize(), screen);
  const hit = pickEntity(state.scene, world);
  if (hit) {
    const start = readTransform(getEntity(state.scene, hit));
    dragging = { id: hit, origin: world, start: { x: start.x, y: start.y }, checkpointed: false };
    panning = null;
  } else {
    dragging = null;
    panning = { last: screen };
  }
  apply(selectEntity(state, hit));
});
canvas.addEventListener('pointermove', event => {
  const screen = localPoint(event);
  const world = toWorld(camera, viewSize(), screen);
  cursorEl.textContent = play ? '' : `x ${format(world.x)}  y ${format(world.y)}`;
  if (dragging && !play) {
    try {
      const delta = localDeltaFor(state.scene, dragging.id, { x: world.x - dragging.origin.x, y: world.y - dragging.origin.y });
      const next = setPosition(state.scene, dragging.id, { x: dragging.start.x + delta.x, y: dragging.start.y + delta.y }, registry, snap);
      if (!dragging.checkpointed) {
        state = checkpoint(state);
        dragging.checkpointed = true;
      }
      state = replaceScene(state, next);
      render();
    } catch (error) {
      logMessage('error', describe(error));
      dragging = null;
    }
    return;
  }
  if (panning) {
    camera = {
      ...camera,
      x: camera.x - (screen.x - panning.last.x) / camera.zoom,
      y: camera.y + (screen.y - panning.last.y) / camera.zoom
    };
    panning.last = screen;
    drawCanvas();
    return;
  }
  if (play) return;
  const over = pickEntity(state.scene, world);
  if (over !== hovered) {
    hovered = over;
    canvas.style.cursor = over ? 'move' : 'grab';
    drawCanvas();
  }
});
canvas.addEventListener('pointerleave', () => {
  cursorEl.textContent = '';
  if (hovered !== null) {
    hovered = null;
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
    renderMeta();
    drawCanvas();
  },
  { passive: false }
);
window.addEventListener('resize', resizeCanvas);
window.addEventListener('beforeunload', event => {
  if (isDirty(state) || play) {
    event.preventDefault();
    event.returnValue = '';
  }
});

/** Opens the demo scene from the project when it exists, so the editor starts with something that plays. */
async function boot() {
  try {
    await refreshAssets();
  } catch {
    logMessage('warn', 'The editor server is not reachable. Start the editor with npm run dev to use assets and saving.');
  }
  try {
    const scenes = await listScenes();
    if (scenes.includes('demo')) {
      await openScene('demo');
    } else {
      logMessage('info', 'Started with a built-in scene. Save to write it into the scenes folder.');
    }
  } catch {
    logMessage('info', 'Started with a built-in scene.');
  }
  updatePlayUi();
  render();
}

resizeCanvas();
updatePlayUi();
render();
void boot();
