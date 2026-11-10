// The inspector when an asset is selected: its properties, a live preview, and where it is used.

import { element, button, fieldRow } from './dom';
import { assetUrl, type AssetInfo } from './assets';
import { session, render } from './session';
import { addEntityAt } from './scene-actions';

/** Entities whose sprite or audio component points at this asset. */
function usersOf(path: string): string[] {
  return session.state.scene.entities
    .filter(entity => {
      const sprite = entity.components.sprite as { texture?: unknown } | undefined;
      const audio = entity.components.audio as { clip?: unknown } | undefined;
      return sprite?.texture === path || audio?.clip === path;
    })
    .map(entity => entity.id);
}

function baseName(path: string): string {
  return path.split('/').pop() ?? path;
}

export function renderAssetInspector(container: HTMLElement, asset: AssetInfo) {
  container.append(element('div', 'name-input asset-title', baseName(asset.path)));

  const info = element('div', 'asset-info');
  const dimensions = element('span', undefined, asset.kind === 'image' ? 'loading…' : '—');
  info.append(
    fieldRow('kind', element('span', undefined, asset.kind)),
    fieldRow('size', element('span', undefined, `${Math.max(1, Math.round(asset.size / 1024))} KB`)),
    fieldRow('path', element('span', 'mono', `assets/${asset.path}`))
  );
  if (asset.kind === 'image') info.append(fieldRow('pixels', dimensions));
  container.append(info);

  if (asset.kind === 'image') {
    const image = element('img', 'preview asset-large');
    image.alt = asset.path;
    image.src = assetUrl(asset.path);
    image.addEventListener('load', () => (dimensions.textContent = `${image.naturalWidth} × ${image.naturalHeight}`));
    container.append(image);
  } else {
    const player = element('audio');
    player.controls = true;
    player.src = assetUrl(asset.path);
    player.addEventListener('loadedmetadata', () => info.append(fieldRow('length', element('span', undefined, `${player.duration.toFixed(2)} s`))));
    container.append(player);
  }

  const users = usersOf(asset.path);
  container.append(fieldRow('used by', element('span', undefined, users.length === 0 ? 'nothing yet' : users.join(', '))));

  const actions = element('div', 'actions');
  if (asset.kind === 'image') {
    const base = baseName(asset.path).replace(/\.[a-z0-9]+$/i, '');
    actions.append(button('Place in scene', () => addEntityAt({ sprite: { texture: asset.path } }, base), 'Create an entity with this sprite at the view centre'));
  }
  actions.append(button('Close', () => {
    session.selectedAsset = null;
    render();
  }, 'Back to the scene inspector'));
  container.append(actions);
}
