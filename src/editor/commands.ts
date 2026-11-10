// Every command the editor has, in one list. The menubar, the Add dropdown, the hierarchy menu and the command palette all use it.

import { addCommands, MOD } from './chrome';
import { apply, session } from './session';
import { undo, redo } from './state';
import { togglePlay, togglePause } from './play';
import { clearConsole } from './log';
import { save, newScene, openSceneDialog, downloadCurrent } from './io';
import { importPicker } from './assets-panel';
import { addEntityAt, duplicateSelected, deleteSelected, focusSelected, resetView, setSnap, setTool } from './scene-actions';

const hasSelection = () => session.state.selected !== null;

export function initCommands() {
  addCommands([
    { menu: 'File', label: 'New scene', group: 1, run: newScene },
    { menu: 'File', label: 'Open scene…', group: 1, run: () => void openSceneDialog() },
    { menu: 'File', label: 'Save', shortcut: `${MOD}S`, group: 2, run: () => void save() },
    { menu: 'File', label: 'Download scene file', group: 2, run: downloadCurrent },
    { menu: 'File', label: 'Import assets…', group: 3, run: importPicker },
    { menu: 'Edit', label: 'Undo', shortcut: `${MOD}Z`, group: 1, enabled: () => session.state.past.length > 0, run: () => apply(undo(session.state)) },
    { menu: 'Edit', label: 'Redo', shortcut: `${MOD}⇧Z`, group: 1, enabled: () => session.state.future.length > 0, run: () => apply(redo(session.state)) },
    { menu: 'Edit', label: 'Duplicate', shortcut: `${MOD}D`, group: 2, enabled: hasSelection, run: duplicateSelected },
    { menu: 'Edit', label: 'Delete', shortcut: 'Del', group: 2, enabled: hasSelection, run: deleteSelected },
    { menu: 'Edit', label: 'Focus selection', shortcut: 'F', group: 3, enabled: hasSelection, run: focusSelected },
    { menu: 'Edit', label: 'Move', shortcut: 'W', group: 1, checked: () => session.tool === 'move', run: () => setTool('move') },
    { menu: 'Edit', label: 'Rotate', shortcut: 'E', group: 1, checked: () => session.tool === 'rotate', run: () => setTool('rotate') },
    { menu: 'Edit', label: 'Scale', shortcut: 'R', group: 1, checked: () => session.tool === 'scale', run: () => setTool('scale') },
    { menu: 'Entity', label: 'Create empty', shortcut: `${MOD}⇧N`, group: 1, run: () => addEntityAt({}) },
    { menu: 'Entity', label: 'Create sprite', group: 1, run: () => addEntityAt({ sprite: { texture: '' } }, 'sprite') },
    { menu: 'Entity', label: 'Create collider', group: 1, run: () => addEntityAt({ collider: {} }, 'collider') },
    { menu: 'Entity', label: 'Create polygon collider', group: 1, run: () => addEntityAt({ collider: { shape: 'polygon' } }, 'polygon') },
    { menu: 'Entity', label: 'Create audio source', group: 1, run: () => addEntityAt({ audio: {} }, 'sound') },
    { menu: 'Entity', label: 'Create child of selection', group: 2, enabled: hasSelection, run: () => addEntityAt({}, 'entity', undefined, session.state.selected) },
    { menu: 'Play', label: 'Play / stop', shortcut: `${MOD}P`, group: 1, run: togglePlay },
    { menu: 'Play', label: 'Pause / resume', group: 1, enabled: () => session.play !== null, run: togglePause },
    { menu: 'View', label: 'Reset view', group: 1, run: resetView },
    { menu: 'View', label: 'Clear console', group: 1, run: clearConsole },
    { menu: 'View', label: 'Snap off', group: 2, checked: () => session.snap === 0, run: () => setSnap(0) },
    { menu: 'View', label: 'Snap 0.1', group: 2, checked: () => session.snap === 0.1, run: () => setSnap(0.1) },
    { menu: 'View', label: 'Snap 0.25', group: 2, checked: () => session.snap === 0.25, run: () => setSnap(0.25) },
    { menu: 'View', label: 'Snap 0.5', group: 2, checked: () => session.snap === 0.5, run: () => setSnap(0.5) },
    { menu: 'View', label: 'Snap 1', group: 2, checked: () => session.snap === 1, run: () => setSnap(1) }
  ]);
}
