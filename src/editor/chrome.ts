/**
 * Editor chrome: menus, popups, command search, theme and the status line.
 *
 * Commands are registered by the editor (main.ts), each with its own `run` and `enabled` check, so menus,
 * the Add dropdown, right-click menus and command search all run the same code. Nothing here knows about scenes.
 */

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
export const MOD = isMac ? '⌘' : 'Ctrl+';

export type MenuName = 'File' | 'Edit' | 'Entity' | 'Play' | 'View' | 'Window';

export interface Command {
  readonly menu: MenuName;
  readonly label: string;
  readonly shortcut?: string;
  readonly run: () => void;
  readonly enabled?: () => boolean;
  /** For toggles such as the theme or snap step. */
  readonly checked?: () => boolean;
  /** Commands with the same group sit together; a separator goes between groups. */
  readonly group?: number;
}

export interface PopupItem {
  readonly label: string;
  readonly shortcut?: string;
  readonly run: () => void;
  readonly enabled?: boolean;
  readonly checked?: boolean;
  readonly separatorBefore?: boolean;
}

const MENUS: readonly MenuName[] = ['File', 'Edit', 'Entity', 'Play', 'View', 'Window'];
const commands: Command[] = [];

export function addCommands(more: readonly Command[]) {
  commands.push(...more);
  renderPalette();
}

export function commandItems(menu: MenuName): PopupItem[] {
  let previous: number | undefined;
  return commands
    .filter(command => command.menu === menu)
    .map(command => {
      const item: PopupItem = {
        label: command.label,
        shortcut: command.shortcut,
        run: command.run,
        enabled: command.enabled?.() ?? true,
        checked: command.checked?.(),
        separatorBefore: previous !== undefined && command.group !== previous
      };
      previous = command.group;
      return item;
    });
}

/** Gestures that have no command, shown in command search so they stay discoverable. */
const GESTURES = 'Drag an entity to move · Drag empty space to pan · Scroll to zoom · Arrow keys nudge (Shift for 1 unit) · Esc deselects · Drag a tab to dock or float it';

// ---------------------------------------------------------------- icons

const ICON_PATHS: Record<string, string> = {
  play: '<path d="M8 5.5v13l10-6.5z" fill="currentColor" stroke="none"/>',
  pause: '<path d="M8 5.5v13M16 5.5v13"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chevron: '<path d="m7 10 5 5 5-5"/>',
  search: '<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/>',
  save: '<path d="M5 4.5h11l3 3V19.5H5z"/><path d="M8.5 4.5v4.5h6V4.5M8.5 19.5v-5h7v5"/>',
  import: '<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 19.5h14"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>'
};

function iconMarkup(name: string): string {
  const paths = ICON_PATHS[name];
  if (paths === undefined) return '';
  return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths}</svg>`;
}

/** Sets a toolbar button's label and icon. Editor state changes go through here so the icon survives. */
export function setButton(button: HTMLElement, label: string, icon?: string) {
  const iconSlot = button.querySelector<HTMLElement>('.ico');
  const text = button.querySelector<HTMLElement>('.label');
  if (iconSlot && icon) iconSlot.innerHTML = iconMarkup(icon);
  if (text) text.textContent = label;
}

function hydrateIcons() {
  document.querySelectorAll<HTMLElement>('[data-icon]').forEach(slot => {
    slot.innerHTML = iconMarkup(slot.dataset.icon ?? '');
  });
}

// ---------------------------------------------------------------- popups

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

let popup: { element: HTMLElement; anchor: HTMLElement | null } | null = null;

export function closePopup() {
  if (!popup) return;
  const { element, anchor } = popup;
  element.remove();
  anchor?.setAttribute('aria-expanded', 'false');
  popup = null;
}

/** Shows a menu at a point (right-click) or below an element (menubar, toolbar dropdowns). */
export function showPopup(where: { x: number; y: number } | HTMLElement, items: readonly PopupItem[]) {
  closePopup();
  const element = document.createElement('div');
  element.className = 'menu';
  element.setAttribute('role', 'menu');
  for (const item of items) {
    if (item.separatorBefore) {
      const rule = document.createElement('div');
      rule.className = 'menu-separator';
      rule.setAttribute('role', 'separator');
      element.append(rule);
    }
    const row = document.createElement('button');
    row.className = 'menu-item';
    row.setAttribute('role', 'menuitem');
    row.disabled = item.enabled === false;
    row.innerHTML = '<span class="check"></span><span class="menu-label"></span><kbd></kbd>';
    row.querySelector('.menu-label')!.textContent = item.label;
    row.querySelector('kbd')!.textContent = item.shortcut ?? '';
    if (item.checked !== undefined) {
      row.setAttribute('aria-checked', String(item.checked));
      if (item.checked) row.querySelector('.check')!.innerHTML = iconMarkup('check');
    }
    row.addEventListener('click', () => {
      closePopup();
      item.run();
    });
    element.append(row);
  }
  document.body.append(element);
  // Place it inside the viewport: flip above or left when it would overflow.
  const size = element.getBoundingClientRect();
  let left: number;
  let top: number;
  let anchor: HTMLElement | null = null;
  if (where instanceof HTMLElement) {
    anchor = where;
    const rect = where.getBoundingClientRect();
    left = rect.left;
    top = rect.bottom + 2;
    where.setAttribute('aria-expanded', 'true');
  } else {
    left = where.x;
    top = where.y;
  }
  if (left + size.width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - size.width - 8);
  if (top + size.height > window.innerHeight - 8) top = Math.max(8, (where instanceof HTMLElement ? where.getBoundingClientRect().top : top) - size.height - 2);
  element.style.left = `${Math.round(left)}px`;
  element.style.top = `${Math.round(top)}px`;
  popup = { element, anchor };
  element.querySelector<HTMLButtonElement>('.menu-item:not(:disabled)')?.focus();
}

function moveFocus(step: number) {
  if (!popup) return;
  const rows = Array.from(popup.element.querySelectorAll<HTMLButtonElement>('.menu-item:not(:disabled)'));
  if (rows.length === 0) return;
  const at = rows.indexOf(document.activeElement as HTMLButtonElement);
  rows[(at + step + rows.length) % rows.length].focus();
}

function buildMenubar() {
  const bar = $('menubar');
  const anchor = bar.querySelector<HTMLElement>('.spacer');
  const triggers: [string, () => PopupItem[]][] = [...MENUS.map(name => [name, () => commandItems(name)] as [string, () => PopupItem[]])];
  for (const [name, items] of triggers) {
    const trigger = document.createElement('button');
    trigger.className = 'menu-trigger';
    trigger.textContent = name;
    trigger.setAttribute('aria-haspopup', 'menu');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.addEventListener('click', event => {
      event.stopPropagation();
      if (popup?.anchor === trigger) closePopup();
      else showPopup(trigger, items());
    });
    trigger.addEventListener('pointerenter', () => {
      if (popup && popup.anchor !== null && popup.anchor !== trigger && popup.anchor.classList.contains('menu-trigger')) showPopup(trigger, items());
    });
    bar.insertBefore(trigger, anchor);
  }
  const help = document.createElement('button');
  help.className = 'menu-trigger';
  help.textContent = 'Help';
  help.addEventListener('click', () => openPalette());
  bar.insertBefore(help, anchor);
}

document.addEventListener('pointerdown', event => {
  if (!popup) return;
  const target = event.target;
  if (target instanceof Node && (popup.element.contains(target) || popup.anchor?.contains(target))) return;
  closePopup();
});

document.addEventListener('contextmenu', event => {
  // Native menus stay out of the editor, except inside text fields.
  const target = event.target as HTMLElement | null;
  if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return;
  if (!target?.closest('[data-context]')) event.preventDefault();
});

// ---------------------------------------------------------------- theme

export type Theme = 'dark' | 'light';
const THEME_KEY = 'scene-editor.theme';

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

export function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Storage can be blocked. The theme then lasts for this session.
  }
  window.dispatchEvent(new Event('themechange'));
}

function restoreTheme() {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(THEME_KEY);
  } catch {
    saved = null;
  }
  document.documentElement.dataset.theme = saved === 'light' ? 'light' : 'dark';
}


// ---------------------------------------------------------------- command search

const palette = $<HTMLDialogElement>('palette');
const paletteInput = $<HTMLInputElement>('palette-input');
const paletteList = $('palette-list');
let paletteIndex = 0;

function paletteItems(): Command[] {
  const query = paletteInput.value.trim().toLowerCase();
  return commands.filter(command => {
    if (query === '') return true;
    const haystack = `${command.menu} ${command.label} ${command.shortcut ?? ''}`.toLowerCase();
    return query.split(/\s+/).every(part => haystack.includes(part));
  });
}

function renderPalette() {
  if (!palette.open && paletteList.childElementCount === 0 && commands.length === 0) return;
  const items = paletteItems();
  paletteIndex = Math.min(paletteIndex, Math.max(0, items.length - 1));
  paletteList.replaceChildren();
  if (items.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'palette-empty';
    empty.textContent = 'No matching command.';
    paletteList.append(empty);
    return;
  }
  items.forEach((command, index) => {
    const row = document.createElement('button');
    row.className = `palette-row${index === paletteIndex ? ' active' : ''}`;
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', String(index === paletteIndex));
    row.disabled = command.enabled?.() === false;
    row.innerHTML = '<span class="palette-menu"></span><span class="palette-label"></span><kbd></kbd>';
    row.querySelector('.palette-menu')!.textContent = command.menu;
    row.querySelector('.palette-label')!.textContent = command.label;
    row.querySelector('kbd')!.textContent = command.shortcut ?? '';
    row.addEventListener('pointermove', () => {
      if (paletteIndex !== index) {
        paletteIndex = index;
        renderPalette();
      }
    });
    row.addEventListener('click', () => runPalette(command));
    paletteList.append(row);
  });
  paletteList.querySelector('.active')?.scrollIntoView({ block: 'nearest' });
}

function runPalette(command: Command) {
  palette.close();
  command.run();
}

export function openPalette() {
  closePopup();
  paletteInput.value = '';
  paletteIndex = 0;
  renderPalette();
  if (!palette.open) palette.showModal();
  paletteInput.focus();
}

paletteInput.addEventListener('input', () => {
  paletteIndex = 0;
  renderPalette();
});
paletteInput.addEventListener('keydown', event => {
  const items = paletteItems();
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    if (items.length === 0) return;
    const step = event.key === 'ArrowDown' ? 1 : -1;
    paletteIndex = (paletteIndex + step + items.length) % items.length;
    renderPalette();
  } else if (event.key === 'Enter') {
    event.preventDefault();
    const choice = items[paletteIndex];
    if (choice && choice.enabled?.() !== false) runPalette(choice);
  }
});
$('palette').querySelector('.palette-gestures')!.textContent = GESTURES;
palette.addEventListener('click', event => {
  if (event.target === palette) palette.close();
});
$('palette-open').addEventListener('click', () => openPalette());

// ---------------------------------------------------------------- status line and header

function mirrorStatus() {
  const consoleEl = $('console');
  const statusText = $('status-text');
  const statusBar = $('status');
  const sceneName = $('scene-name');
  const headerScene = $('header-scene');
  const update = () => {
    const last = consoleEl.lastElementChild;
    statusText.textContent = last?.querySelector('.text')?.textContent ?? 'Ready.';
    statusBar.dataset.level = last?.className.match(/\b(info|warn|error)\b/)?.[1] ?? 'info';
    const name = sceneName.textContent ?? 'Unsaved scene';
    headerScene.textContent = name.replace(/ \*$/, '');
    headerScene.classList.toggle('dirty', name.endsWith(' *'));
  };
  new MutationObserver(update).observe(consoleEl, { childList: true });
  new MutationObserver(update).observe(sceneName, { childList: true, characterData: true, subtree: true });
  update();
}

// ---------------------------------------------------------------- keyboard

window.addEventListener('keydown', event => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    if (palette.open) palette.close();
    else openPalette();
  }
  if (event.key === 'Escape' && popup) closePopup();
  if (popup && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
    event.preventDefault();
    moveFocus(event.key === 'ArrowDown' ? 1 : -1);
  }
});

// Registered after the command search exists, because adding a command renders it.
addCommands([
  { menu: 'View', label: 'Dark theme', group: 9, run: () => setTheme('dark'), checked: () => currentTheme() === 'dark' },
  { menu: 'View', label: 'Light theme', group: 9, run: () => setTheme('light'), checked: () => currentTheme() === 'light' }
]);

// ---------------------------------------------------------------- start

restoreTheme();
hydrateIcons();
buildMenubar();
mirrorStatus();
