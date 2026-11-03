import { AppLifecycle, DebugOverlay, GameLoop, Input, StateManager, UIController, VersionedSaveStore } from './framework';
import { FlappyGame } from './flappy';
import './demo.css';

export interface FlightView { render(game: FlappyGame): void; dispose(): void }

/** Example menus and flow. Framework services contain no Flappy-specific logic. */
export async function startDemo(renderer: string, makeView: (container: HTMLElement) => Promise<FlightView>): Promise<void> {
  const root = document.querySelector<HTMLDivElement>('#app')!;
  root.innerHTML = `<main><header><span class="eyebrow">TINY GAME / ${renderer}</span><h1>Pocket Flight</h1><p>One little bird. One more gap.</p></header>
    <div class="viewport"><div class="canvas"></div><div class="hud" hidden><span>Score <strong class="score">0</strong></span><button data-action="pause" aria-label="Pause game">Ⅱ</button></div><div class="screens"></div></div>
    <footer><p>Tap the sky · Space · Controller A</p><small class="save-status">Best scores are saved on this device.</small></footer></main>`;
  const ui = new UIController(root.querySelector('.screens')!);
  const input = new Input({ flap: { keys: ['Space', 'ArrowUp'], buttons: [0] }, pause: { keys: ['Escape'], buttons: [9] } });
  const game = new FlappyGame();
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
  let flapRequested = false;
  let displayedScore = -1;
  let view: FlightView | undefined;
  let lifecycle: AppLifecycle | undefined;
  let debug: DebugOverlay | undefined;
  let loop: GameLoop | undefined;
  let disposed = false;
  const listeners = new AbortController();
  const dispose = () => {
    if (disposed) return; disposed = true;
    loop?.stop(); listeners.abort(); lifecycle?.dispose(); debug?.dispose(); input.dispose(); states.dispose(); ui.dispose(); view?.dispose();
  };
  if (import.meta.hot) import.meta.hot.dispose(dispose);
  const begin = () => { game.reset(); game.flap(); flapRequested = false; input.reset(); states.change('playing'); };
  const resume = () => { if (lifecycle?.resume()) { input.reset(); flapRequested = false; states.change('playing'); } };
  states.register('menu', { enter: () => { game.reset(); hud.hidden = true; ui.show('menu'); }, update: () => { if (input.pressed('flap')) begin(); } });
  states.register('playing', {
    enter: () => { hud.hidden = false; ui.hide(); },
    update: (_, dt) => {
      if (input.pressed('pause')) { states.change('paused'); return; }
      if (flapRequested || input.pressed('flap')) game.flap(); flapRequested = false;
      game.update(dt);
      if (game.score !== displayedScore) { displayedScore = game.score; score.textContent = String(game.score); }
      if (game.dead) {
        if (game.score > best) { best = game.score; if (saves && !saves.save('best', best).ok) { saves = undefined; saveUnavailable(); } }
        states.change('over');
      }
    }
  });
  states.register('paused', { enter: () => { flapRequested = false; input.reset(); ui.show('paused'); }, update: () => { if (input.pressed('pause')) resume(); } });
  states.register('over', { enter: () => ui.show('over') });
  root.addEventListener('click', event => {
    const action = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action]')?.dataset.action;
    if (action === 'start' && (states.name === 'menu' || states.name === 'over')) begin();
    if (action === 'menu') states.change('menu');
    if (action === 'pause' && states.name === 'playing') states.change('paused');
    if (action === 'resume') resume();
  }, { signal: listeners.signal });
  root.querySelector('.canvas')!.addEventListener('pointerdown', event => {
    event.preventDefault(); if (states.name === 'playing') flapRequested = true;
  }, { signal: listeners.signal });
  try {
    view = await makeView(root.querySelector('.canvas')!);
    if (disposed) { view.dispose(); return; }
    lifecycle = new AppLifecycle(() => { input.reset(); if (states.name === 'playing') states.change('paused'); });
    debug = new URLSearchParams(location.search).has('debug') ? new DebugOverlay(root, () => ({ state: states.name, score: game.score })) : undefined;
    loop = new GameLoop(dt => { input.update(); states.update(dt); view!.render(game); debug?.update(dt); });
    states.change('menu'); loop.start();
  } catch (error) {
    dispose(); root.textContent = 'Could not start the renderer. Check graphics support and reload.'; console.error(error);
  }
}
