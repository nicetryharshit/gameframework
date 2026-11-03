import { EventBus, GameLoop, Input, SaveStore, StateManager, UIController } from './framework';
import './style.css';

type Events = { start: undefined; pause: undefined; resume: undefined; menu: undefined; score: number };
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `<main><header><h1>Game Starter</h1><p>Try the canvas examples: <a href="./2d.html">2D with PixiJS</a> · <a href="./3d.html">3D with Three.js</a></p><p>Or try the shared game flow below.</p></header><div id="screens"></div></main>`;
const ui = new UIController(app.querySelector('#screens')!);
const events = new EventBus<Events>();
const saves = new SaveStore('game-starter');
const input = new Input({ pause: { keys: ['Escape'], buttons: [9] }, point: { keys: ['Space'], buttons: [0] } });
let score = 0;
let best = saves.load('best', 0);

function screen(markup: string): HTMLElement {
  const element = document.createElement('section'); element.innerHTML = markup; return element;
}
const menu = screen(`<h2>Ready to play?</h2><p>Collect points with Space or the button below. Press Escape to pause.</p><p class="best"></p><button data-action="start">Start game</button>`);
const game = screen(`<h2>Playing</h2><p>Points: <strong class="score">0</strong></p><button data-action="point">Collect a point</button> <button data-action="pause">Pause</button>`);
const paused = screen(`<h2>Paused</h2><p>Take your time.</p><button data-action="resume">Resume</button> <button data-action="menu">Main menu</button>`);
ui.register('menu', { element: menu, show: () => { menu.querySelector('.best')!.textContent = `Best: ${best}`; } });
ui.register('game', { element: game });
ui.register('paused', { element: paused });

const states = new StateManager({ ui });
states.register('menu', { enter: ({ ui }) => ui.show('menu') });
states.register('playing', {
  enter: ({ ui }) => ui.show('game'),
  update: () => { if (input.pressed('pause')) events.emit('pause', undefined); else if (input.pressed('point')) addPoint(); }
});
states.register('paused', { enter: ({ ui }) => ui.show('paused'), update: () => { if (input.pressed('pause')) events.emit('resume', undefined); } });
function addPoint(): void { score++; events.emit('score', score); }
events.on('start', () => { score = 0; game.querySelector('.score')!.textContent = '0'; states.change('playing'); });
events.on('pause', () => { if (states.name === 'playing') states.change('paused'); });
events.on('resume', () => { if (states.name === 'paused') states.change('playing'); });
events.on('menu', () => states.change('menu'));
events.on('score', value => {
  game.querySelector('.score')!.textContent = String(value);
  if (value > best) { best = value; try { saves.save('best', best); } catch (error) { console.warn('Could not save best score', error); } }
});
app.addEventListener('click', event => {
  const action = (event.target as HTMLElement).closest<HTMLButtonElement>('button')?.dataset.action;
  if (action === 'point') addPoint();
  else if (action === 'start' || action === 'pause' || action === 'resume' || action === 'menu') events.emit(action, undefined);
});
const loop = new GameLoop(dt => { input.update(); states.update(dt); });
states.change('menu'); loop.start();
if (import.meta.hot) import.meta.hot.dispose(() => { loop.stop(); states.dispose(); input.dispose(); ui.dispose(); events.clear(); });
