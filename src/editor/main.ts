// The editor's entry point. Each module owns one part of the editor; this file only starts them in order.

import './shell';
import { initCanvas, resizeCanvas } from './canvas';
import { initCanvasInput } from './canvas-input';
import { initStatus } from './status';
import { initHierarchy } from './hierarchy';
import { initInspector } from './inspector';
import { initAssets, refreshAssets } from './assets-panel';
import { initPlay } from './play';
import { initToolbar } from './toolbar';
import { initKeyboard } from './keyboard';
import { initCommands } from './commands';
import { initIo, openScene } from './io';
import { listScenes } from './assets';
import { logMessage } from './log';
import { render } from './session';

initCanvas();
initStatus();
initHierarchy();
initInspector();
initAssets();
initPlay();
initToolbar();
initCanvasInput();
initKeyboard();
initCommands();
initIo();

/** Opens the demo scene from the project when it exists, so the editor starts with something that plays. */
async function boot() {
  try {
    await refreshAssets();
  } catch {
    logMessage('warn', 'The editor server is not reachable. Start the editor with npm run dev to use assets and saving.');
  }
  try {
    const scenes = await listScenes();
    if (scenes.includes('demo')) await openScene('demo');
    else logMessage('info', 'Started with a built-in scene. Save to write it into the scenes folder.');
  } catch {
    logMessage('info', 'Started with a built-in scene.');
  }
  render();
}

resizeCanvas();
render();
void boot();
