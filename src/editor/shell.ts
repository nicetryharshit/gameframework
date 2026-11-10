/**
 * Docking shell. Panels can be dragged, split, tabbed and floated, as in Meerkat's workspace.
 *
 * Each panel's DOM lives in a persistent container (see editor.html). A PanelHost moves that container
 * into whichever tab currently shows it and parks it again when the tab goes away, so the editor's
 * panel code keeps its state and its canvas wherever the tab is docked.
 */
import { createElement, useLayoutEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { Actions, DockLocation, Layout, Model, type IJsonModel, type IJsonTabNode, type TabNode } from 'flexlayout-react';
import 'flexlayout-react/style/dark.css';
import { addCommands } from './chrome';

export const PANELS = {
  viewport: 'Viewport',
  hierarchy: 'Hierarchy',
  inspector: 'Inspector',
  assets: 'Assets',
  console: 'Console'
} as const;
export type PanelId = keyof typeof PANELS;
const PANEL_IDS = Object.keys(PANELS) as PanelId[];
const STORAGE_KEY = 'scene-editor.workspace.v1';

const GLOBAL = {
  rootOrientationVertical: true,
  tabEnableFloat: true,
  tabEnableFloatIcon: true,
  tabEnablePopout: false,
  tabEnableRename: false,
  tabEnableRenderOnDemand: false,
  tabSetEnableDeleteWhenEmpty: true,
  tabSetEnableCloseButton: false,
  tabSetMinWidth: 160,
  tabSetMinHeight: 96,
  constrainFloatPanels: true,
  realtimeResize: true,
  // Seconds the drop rectangle takes to slide to a new slot. Was 0.12; three times faster.
  tabDragSpeed: 0.04
};

function tab(id: PanelId): IJsonTabNode {
  return { type: 'tab', id, component: id, name: PANELS[id], minWidth: 160, minHeight: 100 };
}

function tabset(id: string, weight: number, panels: PanelId[]) {
  return { type: 'tabset' as const, id, weight, children: panels.map(tab) };
}

/** The starting arrangement: hierarchy and assets on the left, the viewport in the centre, inspector on the right, console below. */
export function defaultLayout(): IJsonModel {
  return {
    global: GLOBAL,
    layout: {
      type: 'row',
      id: 'root',
      children: [
        {
          type: 'row',
          id: 'upper',
          weight: 76,
          children: [
            tabset('left', 20, ['hierarchy', 'assets']),
            tabset('center', 56, ['viewport']),
            tabset('right', 24, ['inspector'])
          ]
        },
        tabset('bottom', 24, ['console'])
      ]
    }
  } as IJsonModel;
}

/**
 * Saved layouts come from browser storage, so they are checked before use. Anything unexpected falls
 * back to the default arrangement, which is always valid.
 */
function validateLayout(value: unknown): IJsonModel {
  if (!value || typeof value !== 'object') throw new Error('Layout is not an object');
  const json = structuredClone(value) as IJsonModel;
  const ids = new Set<string>();
  let count = 0;
  const walk = (node: unknown, depth: number) => {
    if (++count > 200 || depth > 16 || !node || typeof node !== 'object') throw new Error('Layout is too large or malformed');
    const item = node as { type?: string; id?: unknown; component?: unknown; children?: unknown; weight?: unknown };
    if (!['row', 'tabset', 'tab'].includes(item.type ?? '')) throw new Error('Unknown layout node');
    if (typeof item.id === 'string') {
      if (ids.has(item.id)) throw new Error('Duplicate layout id');
      ids.add(item.id);
    }
    if (item.weight !== undefined && (typeof item.weight !== 'number' || !Number.isFinite(item.weight) || item.weight <= 0)) throw new Error('Invalid weight');
    if (item.type === 'tab') {
      if (!PANEL_IDS.includes(item.id as PanelId) || item.component !== item.id) throw new Error('Unknown panel');
      Object.assign(item, tab(item.id as PanelId));
      return;
    }
    if (!Array.isArray(item.children)) throw new Error('Missing children');
    item.children.forEach(child => walk(child, depth + 1));
  };
  const root = json as unknown as { layout?: unknown; borders?: unknown[] };
  if (!root.layout || (root.borders?.length ?? 0) > 0) throw new Error('Unsupported layout');
  walk(root.layout, 0);
  json.global = { ...(defaultLayout().global ?? {}), ...GLOBAL };
  return json;
}

function loadModel(): Model {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return Model.fromJson(validateLayout(JSON.parse(raw)));
  } catch {
    // Unreadable or blocked storage: start from the default arrangement.
  }
  return Model.fromJson(defaultLayout());
}

function saveModel(next: Model) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next.toJson()));
  } catch {
    // Storage can be full or blocked. The arrangement then lasts for this session only.
  }
}

let model = loadModel();
let revision = 0;

const parking = () => document.getElementById('parking')!;

/** Puts a panel's persistent container into the tab that shows it, and parks it when that tab goes away. */
function PanelHost({ id }: { id: PanelId }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const host = ref.current!;
    const container = document.getElementById(`panel-${id}`);
    if (!container) return;
    host.append(container);
    // The canvas sizes itself from its container, which was hidden until now.
    window.dispatchEvent(new Event('resize'));
    return () => {
      if (container.parentElement === host) parking().append(container);
    };
  }, [id]);
  return createElement('div', { ref, className: 'panel-host' });
}

function App() {
  return createElement(Layout, {
    key: revision,
    model,
    factory: (node: TabNode) => createElement(PanelHost, { key: node.getId(), id: node.getComponent() as PanelId }),
    onModelChange: (next: Model) => saveModel(next),
    supportsPopout: false
  });
}

const mount = createRoot(document.getElementById('layout')!);
mount.render(createElement(App));

/** Brings a closed panel back. A panel that is already open is selected instead. */
export function showPanel(id: PanelId) {
  if (model.getNodeById(id)) {
    model.doAction(Actions.selectTab(id));
    return;
  }
  let target: string | undefined;
  model.visitNodes(node => {
    if (target === undefined && node.getType() === 'tabset') target = node.getId();
  });
  if (target === undefined) {
    resetLayout();
    return;
  }
  model.doAction(Actions.addNode(tab(id), target, DockLocation.CENTER, -1, true));
}

export function resetLayout() {
  model = Model.fromJson(defaultLayout());
  saveModel(model);
  revision += 1;
  mount.render(createElement(App));
}

addCommands([
  { menu: 'Window', label: 'Reset layout', run: resetLayout },
  ...PANEL_IDS.map(id => ({ menu: 'Window' as const, label: `Show ${PANELS[id]}`, run: () => showPanel(id) }))
]);

// The viewport resizes whenever its tab is shown, hidden or moved.
const layoutEl = document.getElementById('layout')!;
new ResizeObserver(() => window.dispatchEvent(new Event('resize'))).observe(layoutEl);
