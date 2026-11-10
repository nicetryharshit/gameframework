// The Assets panel: images and sounds as a list or a thumbnail grid, with a size slider (like Meerkat's catalog views).
// The choice and size are saved in this browser only.

import { assetKindOf, assetUrl, listAssets, uploadAsset, type AssetInfo } from './assets';
import { button, byId, element } from './dom';
import { apply, onRender, render, session } from './session';
import { selectEntity } from './state';
import { images } from './canvas';
import { describe, logMessage } from './log';

type ViewMode = 'list' | 'grid';
interface AssetView {
  mode: ViewMode;
  size: number;
}

const VIEW_KEY = 'scene-editor.assets-view';
const SIZE_MIN = 40;
const SIZE_MAX = 144;
const assetsEl = byId<HTMLElement>('assets');
const importInput = byId<HTMLInputElement>('import');

const clampSize = (value: number) => Math.max(SIZE_MIN, Math.min(SIZE_MAX, value));

function loadView(): AssetView {
  try {
    const saved = JSON.parse(localStorage.getItem(VIEW_KEY) || 'null');
    if (saved && (saved.mode === 'list' || saved.mode === 'grid') && Number.isFinite(saved.size)) {
      return { mode: saved.mode, size: clampSize(saved.size) };
    }
  } catch {
    /* A remembered preference is optional. */
  }
  return { mode: 'grid', size: 72 };
}

let view = loadView();

function saveView() {
  try {
    localStorage.setItem(VIEW_KEY, JSON.stringify(view));
  } catch {
    /* A remembered preference is optional. */
  }
}

const baseName = (path: string) => path.split('/').pop() ?? path;

function assetRow(asset: AssetInfo): HTMLElement {
  const row = element('div', `asset${asset.path === session.selectedAsset ? ' selected' : ''}`);
  row.title = asset.path;
  row.draggable = true;
  if (asset.kind === 'image') {
    const thumb = element('img', 'thumb');
    thumb.src = assetUrl(asset.path);
    thumb.alt = '';
    thumb.loading = 'lazy';
    row.append(thumb);
  } else {
    row.append(element('span', 'thumb audio-icon', '♪'));
  }
  row.append(element('span', 'asset-name', view.mode === 'list' ? asset.path : baseName(asset.path)));
  row.addEventListener('click', () => {
    // Selecting an asset deselects the entity, so the inspector shows the asset.
    apply(selectEntity(session.state, null));
    session.selectedAsset = asset.path;
    render();
  });
  row.addEventListener('dragstart', event => {
    event.dataTransfer?.setData('application/x-asset', asset.path);
    event.dataTransfer?.setData('text/plain', asset.path);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
  });
  return row;
}

export function renderAssets() {
  assetsEl.replaceChildren();
  assetsEl.dataset.mode = view.mode;
  assetsEl.style.setProperty('--thumb', `${view.size}px`);
  if (session.assets.length === 0) {
    assetsEl.append(element('p', 'note hint', 'No assets yet. Import images or sounds, or drop files here. They are stored in assets/images and assets/audio.'));
    return;
  }
  for (const kind of ['image', 'audio'] as const) {
    const group = session.assets.filter(asset => asset.kind === kind);
    if (group.length === 0) continue;
    assetsEl.append(element('div', 'group', kind === 'image' ? 'Images' : 'Audio'));
    for (const asset of group) assetsEl.append(assetRow(asset));
  }
}

/** The list/grid toggle and the thumbnail size slider, placed in the Assets toolbar. */
function viewControls(): HTMLElement {
  const group = element('div', 'view-controls');
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', 'Assets view');
  const modeButtons: HTMLButtonElement[] = [];
  for (const mode of ['list', 'grid'] as const) {
    const label = mode === 'list' ? 'List' : 'Grid';
    const toggle = button(label, () => {
      view = { ...view, mode };
      saveView();
      render();
    }, `${label} view`);
    toggle.dataset.mode = mode;
    toggle.setAttribute('aria-label', `${label} view`);
    modeButtons.push(toggle);
    group.append(toggle);
  }
  const slider = element('input');
  slider.type = 'range';
  slider.min = String(SIZE_MIN);
  slider.max = String(SIZE_MAX);
  slider.step = '8';
  slider.title = 'Thumbnail size';
  slider.setAttribute('aria-label', 'Thumbnail size');
  slider.addEventListener('input', () => {
    view = { ...view, size: clampSize(Number(slider.value)) };
    saveView();
    renderAssets();
  });
  group.append(slider);
  onRender(() => {
    for (const toggle of modeButtons) toggle.setAttribute('aria-pressed', String(toggle.dataset.mode === view.mode));
    slider.value = String(view.size);
    slider.style.setProperty('--range-progress', `${((view.size - SIZE_MIN) / (SIZE_MAX - SIZE_MIN)) * 100}%`);
  });
  return group;
}

export function importPicker() {
  importInput.click();
}

export async function importFiles(files: File[]) {
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
      session.selectedAsset = info.path;
      logMessage('info', `Imported assets/${info.path}.`);
    } catch (error) {
      logMessage('error', describe(error));
    }
  }
  await refreshAssets();
}

export async function refreshAssets() {
  try {
    session.assets = await listAssets();
    render();
  } catch (error) {
    logMessage('error', `Could not read the assets folder: ${describe(error)}`);
  }
}

export function initAssets() {
  byId('import-assets').parentElement?.append(viewControls());
  onRender(renderAssets);
  importInput.addEventListener('change', () => {
    const files = Array.from(importInput.files ?? []);
    importInput.value = '';
    void importFiles(files);
  });
  // Dropping files on the panel imports them.
  assetsEl.addEventListener('dragover', event => {
    if (event.dataTransfer?.types.includes('Files')) event.preventDefault();
  });
  assetsEl.addEventListener('drop', event => {
    if (!event.dataTransfer?.files.length) return;
    event.preventDefault();
    void importFiles(Array.from(event.dataTransfer.files));
  });
}
