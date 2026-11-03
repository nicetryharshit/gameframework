import { AppLifecycle, bindActionButton, DebugOverlay, GameLoop, Input, StateManager, UIController } from './framework';
import './demo.css';

type World = { update(dt: number, input: Input): void; render(): void; dispose(): void };

/** Shared example flow. The world stays alive while the pause overlay is open. */
export async function startDemo(title: string, makeWorld: (container: HTMLElement) => Promise<World>): Promise<void> {
  const root = document.querySelector<HTMLDivElement>('#app')!;
  root.innerHTML = `<main><h1>${title}</h1><p>Move with arrow keys or WASD. Escape pauses.</p><div class="viewport"><div class="canvas"></div><div class="screens"></div></div><p><a href="./index.html">Choose another example</a></p></main>`;
  const container = root.querySelector<HTMLElement>('.canvas')!;
  const ui = new UIController(root.querySelector<HTMLElement>('.screens')!);
  const input = new Input({
    left: { keys: ['ArrowLeft', 'KeyA'], buttons: [14] }, right: { keys: ['ArrowRight', 'KeyD'], buttons: [15] },
    up: { keys: ['ArrowUp', 'KeyW'], buttons: [12] }, down: { keys: ['ArrowDown', 'KeyS'], buttons: [13] },
    pause: { keys: ['Escape'], buttons: [9] }
  });
  input.bind('left', { keys: ['ArrowLeft', 'KeyA'], buttons: [14], axes: [{ index: 0, direction: -1 }] });
  input.bind('right', { keys: ['ArrowRight', 'KeyD'], buttons: [15], axes: [{ index: 0, direction: 1 }] });
  input.bind('up', { keys: ['ArrowUp', 'KeyW'], buttons: [12], axes: [{ index: 1, direction: -1 }] });
  input.bind('down', { keys: ['ArrowDown', 'KeyS'], buttons: [13], axes: [{ index: 1, direction: 1 }] });
  const controls = document.createElement('nav'); controls.className = 'touch-controls'; controls.setAttribute('aria-label', 'Game controls');
  const cleanups: (() => void)[] = [];
  for (const [action, label] of [['left', '←'], ['up', '↑'], ['down', '↓'], ['right', '→']]) {
    const button = document.createElement('button'); button.textContent = label; button.setAttribute('aria-label', action);
    controls.append(button); cleanups.push(bindActionButton(button, input, action));
  }
  const pauseButton = document.createElement('button'); pauseButton.textContent = 'Pause'; controls.append(pauseButton);
  root.querySelector('main')!.append(controls);
  const paused = document.createElement('section');
  paused.innerHTML = '<h2>Paused</h2><button>Resume</button>';
  ui.register('pause', { element: paused });
  const world = await makeWorld(container);
  const states = new StateManager({});
  states.register('playing', { enter: () => ui.hide(), update: (_, dt) => { if (input.pressed('pause')) states.change('paused'); else world.update(dt, input); } });
  states.register('paused', { enter: () => ui.show('pause'), update: () => { if (input.pressed('pause') && lifecycle.resume()) states.change('playing'); } });
  const lifecycle = new AppLifecycle(() => { input.reset(); states.change('paused'); });
  const debug = new URLSearchParams(location.search).has('debug') ? new DebugOverlay(root, () => ({ state: states.name })) : undefined;
  paused.querySelector('button')!.addEventListener('click', () => { if (lifecycle.resume()) states.change('playing'); });
  pauseButton.addEventListener('click', () => states.change('paused'));
  const loop = new GameLoop(dt => { input.update(); states.update(dt); world.render(); debug?.update(dt); });
  states.change(document.hidden ? 'paused' : 'playing'); loop.start();
  if (import.meta.hot) import.meta.hot.dispose(() => { loop.stop(); lifecycle.dispose(); debug?.dispose(); cleanups.forEach(cleanup => cleanup()); states.dispose(); input.dispose(); ui.dispose(); world.dispose(); });
}
