import { AppLifecycle, DebugOverlay, EventBus, GameLoop, Input, StateManager, UIController, VersionedSaveStore } from './framework';
import { FlappyGame } from './flappy';
import { createGameOptions } from './demo-settings';

export interface FlightView { render(game: FlappyGame): void; setRenderScale?(scale: number): void; dispose(): void }

/** Example menus and flow. Framework services contain no Flappy-specific logic. */
export async function startDemo(renderer: string, makeView: (container: HTMLElement) => Promise<FlightView>): Promise<() => void> {
  const root = document.querySelector<HTMLDivElement>('#app')!;
  root.innerHTML = `<main><header><span class="eyebrow">TINY GAME / ${renderer}</span><h1>Pocket Flight</h1><p>One little bird. One more gap.</p></header>
    <div class="viewport"><div class="canvas"></div><div class="hud" hidden><span>Score <strong class="score">0</strong></span><button data-action="pause" aria-label="Pause game">Ⅱ</button></div><div class="screens"></div></div>
    <footer><p>Tap the sky · Space · Controller A</p><small class="save-status">Best scores are saved on this device.</small></footer></main>`;
  const ui = new UIController(root.querySelector('.screens')!);
  const input = new Input({
    flap: { keys: ['Space', 'Enter'], buttons: [0] }, pause: { keys: ['Escape'], buttons: [9] },
    menuUp: { keys: ['ArrowUp'], buttons: [12], axes: [{ index: 1, direction: -1 }] },
    menuDown: { keys: ['ArrowDown'], buttons: [13], axes: [{ index: 1, direction: 1 }] },
    menuLeft: { buttons: [14], axes: [{ index: 0, direction: -1 }] }, menuRight: { buttons: [15], axes: [{ index: 0, direction: 1 }] }
  });
  const game = new FlappyGame();
  const options = await createGameOptions();
  ui.register('settings', { element: options.element, show: options.show });
  let settingsReturn = 'menu';
  const states = new StateManager({});
  const hud = root.querySelector<HTMLElement>('.hud')!;
  const score = root.querySelector('.score')!;
  const saveStatus = root.querySelector('.save-status')!;
  let best = 0;
  let saves: VersionedSaveStore<number> | undefined;
  const saveUnavailable = () => { saveStatus.textContent = 'Saving unavailable. Your best lasts for this session.'; };
  try {
    saves = new VersionedSaveStore('pocket-flight', { version: 1, validate: (value): value is number => Number.isInteger(value) && (value as number) >= 0 }, localStorage);
    const loaded = saves.load('best');
    if (loaded.ok) best = loaded.value ?? 0; else { saves = undefined; saveUnavailable(); }
  } catch { saveUnavailable(); }
  function screen(name: string, html: string, show?: () => void): void {
    const element = document.createElement('section'); element.innerHTML = html;
    ui.register(name, { element, show: () => { show?.(); element.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true }); } });
  }
  screen('menu', '<span class="badge">READY TO FLY?</span><h2>Find your rhythm.</h2><p>Flap through the gaps.<br>Stay off the pipes and the ground.</p><button data-action="start">Let’s fly</button><p class="best"></p>', () => { root.querySelector('.best')!.textContent = `Personal best · ${best}`; });
  screen('paused', '<span class="badge">TAKE A BREATHER</span><h2>Flight paused.</h2><button data-action="resume">Keep flying</button><button class="secondary" data-action="menu">Main menu</button>');
  screen('over', '<span class="badge">NICE FLIGHT</span><h2>Try another?</h2><p class="result" role="status"></p><button data-action="start">Fly again</button><button class="secondary" data-action="menu">Main menu</button>', () => { root.querySelector('.result')!.textContent = `Score ${game.score} · Best ${best}`; });
  for (const name of ['menu', 'paused']) {
    const section = root.querySelector(`[data-action="${name === 'menu' ? 'start' : 'resume'}"]`)!.parentElement!;
    const button = document.createElement('button'); button.dataset.action = 'settings'; button.className = 'secondary'; button.textContent = 'Settings'; section.append(button);
    if (options.desktop) { const quit = document.createElement('button'); quit.dataset.action = 'quit'; quit.className = 'secondary'; quit.textContent = 'Quit game'; section.append(quit); }
  }
  let flapRequested = false;
  let displayedScore = -1;
  let view: FlightView | undefined;
  let lifecycle: AppLifecycle | undefined;
  let debug: DebugOverlay | undefined;
  let loop: GameLoop | undefined;
  let disposed = false;
  const listeners = new AbortController();
  // Gameplay announces what happened; sound and saving react to it, so the loop does not call them directly.
  const events = new EventBus<{ flap: undefined; score: number; died: number }>();
  events.on('flap', () => options.sound('flap'));
  events.on('score', () => options.sound('score'));
  events.on('died', finalScore => {
    options.sound('crash');
    if (finalScore > best) { best = finalScore; if (saves && !saves.save('best', best).ok) { saves = undefined; saveUnavailable(); } }
  });
  const dispose = () => {
    if (disposed) return; disposed = true;
    loop?.stop(); listeners.abort(); events.clear(); lifecycle?.dispose(); options.dispose(); debug?.dispose(); input.dispose(); states.dispose(); ui.dispose(); view?.dispose();
  };
  if (import.meta.hot) import.meta.hot.dispose(dispose);
  const begin = () => { options.unlock(); game.reset(); game.flap(); flapRequested = false; input.reset(); states.change('playing'); };
  const resume = () => { if (lifecycle?.resume()) { options.unlock(); input.reset(); flapRequested = false; states.change('playing'); } };
  const updateMenu = () => {
    const buttons = Array.from(root.querySelectorAll<HTMLElement>('.screens section:not([hidden]) button, .screens section:not([hidden]) input, .screens section:not([hidden]) select')).filter(control => !(control as HTMLInputElement).disabled && !control.closest('[hidden]'));
    if (!buttons.length) return;
    let index = Math.max(0, buttons.indexOf(document.activeElement as HTMLButtonElement));
    if (input.pressed('menuUp')) index = (index + buttons.length - 1) % buttons.length;
    if (input.pressed('menuDown')) index = (index + 1) % buttons.length;
    if (input.pressed('menuUp') || input.pressed('menuDown')) buttons[index].focus({ preventScroll: true });
    if (input.pressed('flap')) buttons[index].click();
  };
  states.register('menu', { enter: () => { game.reset(); hud.hidden = true; ui.show('menu'); }, update: updateMenu });
  states.register('playing', {
    enter: () => { hud.hidden = false; ui.hide(); },
    update: (_, dt) => {
      if (input.pressed('pause')) { states.change('paused'); return; }
      if (flapRequested || input.pressed('flap')) { options.unlock(); game.flap(); events.emit('flap', undefined); } flapRequested = false;
      game.update(dt);
      if (game.score !== displayedScore) { if (game.score > displayedScore && displayedScore >= 0) events.emit('score', game.score); displayedScore = game.score; score.textContent = String(game.score); }
      if (game.dead) {
        events.emit('died', game.score);
        states.change('over');
      }
    }
  });
  states.register('paused', { enter: () => { options.suspend(); flapRequested = false; input.reset(); ui.show('paused'); }, update: () => { if (input.pressed('pause')) resume(); else updateMenu(); } });
  states.register('over', { enter: () => ui.show('over'), update: updateMenu });
  states.register('settings', { enter: () => { input.reset(); ui.show('settings'); }, update: () => { options.navigate(input); if (input.pressed('pause')) states.change(settingsReturn); else updateMenu(); } });
  root.addEventListener('click', event => {
    const action = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action]')?.dataset.action;
    if (action === 'start' && (states.name === 'menu' || states.name === 'over')) begin();
    if (action === 'menu') states.change('menu');
    if (action === 'pause' && states.name === 'playing') states.change('paused');
    if (action === 'resume') resume();
    if (action === 'settings' && (states.name === 'menu' || states.name === 'paused')) { settingsReturn = states.name; states.change('settings'); }
    if (action === 'back' && states.name === 'settings') states.change(settingsReturn);
    if (action === 'quit') void options.desktop?.quit().catch(error => console.error('Could not close window', error));
  }, { signal: listeners.signal });
  window.addEventListener('keydown', event => {
    if (event.code === 'Space' || event.code === 'Enter') options.unlock();
    if (states.name === 'settings' && event.code === 'Escape') { event.preventDefault(); states.change(settingsReturn); }
    if (options.desktop && event.code === 'F11') { event.preventDefault(); if (!event.repeat) void options.toggleFullscreen(); }
  }, { signal: listeners.signal });
  root.querySelector('.canvas')!.addEventListener('pointerdown', event => {
    event.preventDefault(); if (states.name === 'playing') { options.unlock(); flapRequested = true; }
  }, { signal: listeners.signal });
  try {
    view = await makeView(root.querySelector('.canvas')!);
    if (disposed) { view.dispose(); return dispose; }
    lifecycle = new AppLifecycle(() => { input.reset(); if (states.name === 'playing') states.change('paused'); });
    debug = new URLSearchParams(location.search).has('debug') ? new DebugOverlay(root, () => ({ state: states.name, score: game.score })) : undefined;
    loop = new GameLoop(dt => { input.update(); states.update(dt); view!.render(game); debug?.update(dt); });
    await options.initialize(preferences => { loop!.setFrameLimit(preferences.frameLimit); view!.setRenderScale?.(preferences.renderScale); });
    states.change('menu'); loop.start();
  } catch (error) {
    dispose(); root.textContent = 'Could not start the renderer. Check graphics support and reload.'; console.error(error);
  }
  return dispose;
}
