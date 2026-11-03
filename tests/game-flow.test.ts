import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { startDemo } from '../src/demo';
import type { FlappyGame } from '../src/flappy';
import { Input } from '../src/framework/input';

test('quick keyboard and virtual taps survive until polling without leaving an action held', () => {
  const dom = new Window();
  const input = new Input({ fire: { keys: ['Space'] } }, dom as unknown as globalThis.Window);
  const key = (type: string) => dom.dispatchEvent(new dom.KeyboardEvent(type, { code: 'Space', cancelable: true }));
  key('keydown'); key('keyup'); input.update();
  assert.equal(input.pressed('fire'), true); assert.equal(input.released('fire'), true); assert.equal(input.held('fire'), false);
  input.update(); assert.equal(input.pressed('fire'), false); assert.equal(input.released('fire'), false);
  input.setVirtual('fire', true); input.setVirtual('fire', false); input.update(); assert.equal(input.pressed('fire'), true);
  input.reset(); input.update(); assert.equal(input.pressed('fire'), false);
  input.dispose(); dom.close();
});

test('real example flow: keyboard/controller menus, scoring, persistence, pause, death, restart and teardown', async () => {
  const dom = new Window({ url: 'http://localhost/' });
  dom.document.body.innerHTML = '<div id="app"></div>';
  Object.defineProperty(dom.document, 'hidden', { configurable: true, value: false });
  const buttons = Array.from({ length: 16 }, () => ({ pressed: false }));
  Object.defineProperty(dom.navigator, 'getGamepads', { value: () => [{ connected: true, axes: [0, 0], buttons }] });
  let callback: FrameRequestCallback | undefined, time = 0;
  const replacements: Record<string, unknown> = {
    window: dom, document: dom.document, location: dom.location, localStorage: dom.localStorage, AbortController: dom.AbortController,
    requestAnimationFrame: (cb: FrameRequestCallback) => { callback = cb; return 1; }, cancelAnimationFrame: () => { callback = undefined; }
  };
  const originals = new Map(Object.keys(replacements).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(replacements)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const random = Math.random; Math.random = () => 0.5;
  let dispose: (() => void) | undefined;
  let game: FlappyGame | undefined; let disposedViews = 0; let renderScale = 0;
  const frame = () => { const next = callback; callback = undefined; assert.ok(next); next(time += 1000 / 60); };
  const screen = () => dom.document.querySelector('.screens section:not([hidden])')?.textContent ?? 'playing';
  const tapKey = (code: string) => { dom.dispatchEvent(new dom.KeyboardEvent('keydown', { code, cancelable: true })); dom.dispatchEvent(new dom.KeyboardEvent('keyup', { code })); frame(); };
  const tapPad = (index: number) => { buttons[index].pressed = true; frame(); buttons[index].pressed = false; frame(); };
  try {
    dispose = await startDemo('TEST', async () => ({ render(model) { game = model; }, setRenderScale(value) { renderScale = value; }, dispose() { disposedViews++; } }));
    frame(); assert.match(screen(), /Find your rhythm/);
    tapKey('Space'); assert.equal(screen(), 'playing');
    for (let i = 0; i < 400 && game!.score === 0 && !game!.dead; i++) {
      if (game!.y > 330 && game!.velocity > 0) dom.document.querySelector('.canvas')!.dispatchEvent(new dom.PointerEvent('pointerdown', { bubbles: true }));
      frame();
    }
    assert.equal(game!.score, 1); assert.equal(dom.document.querySelector('.score')!.textContent, '1');
    tapKey('Escape'); assert.match(screen(), /Flight paused/);
    const pausedY = game!.y; for (let i = 0; i < 10; i++) frame(); assert.equal(game!.y, pausedY);
    tapKey('Enter'); assert.equal(screen(), 'playing');
    dom.dispatchEvent(new dom.Event('blur')); assert.match(screen(), /Flight paused/);
    tapPad(0); assert.equal(screen(), 'playing');
    for (let i = 0; i < 180 && !game!.dead; i++) frame();
    assert.match(screen(), /Try another/); assert.match(dom.document.querySelector('.result')!.textContent!, /Score 1 · Best 1/);
    assert.equal(JSON.parse(dom.localStorage.getItem('pocket-flight:best')!).data, 1);
    tapPad(0); assert.equal(screen(), 'playing'); assert.equal(game!.score, 0); assert.equal(game!.dead, false);
    for (let i = 0; i < 180 && !game!.dead; i++) frame();
    assert.match(screen(), /Try another/);
    tapKey('Space'); assert.equal(screen(), 'playing');
    tapPad(9); assert.match(screen(), /Flight paused/);
    tapPad(13); assert.equal((dom.document.activeElement as unknown as HTMLElement).dataset.action, 'menu');
    tapPad(0); assert.match(screen(), /Find your rhythm/);
    tapKey('Enter'); tapKey('Escape'); tapKey('ArrowDown'); tapKey('Enter'); assert.match(screen(), /Find your rhythm/);
    const click = (selector: string) => dom.document.querySelector<import('happy-dom').HTMLButtonElement>(selector)!.click();
    click('[data-action="settings"]'); assert.match(screen(), /Settings/);
    assert.equal((dom.document.querySelector('.desktop-options') as unknown as HTMLElement).hidden, true);
    (dom.document.querySelector('[name="renderScale"]') as unknown as HTMLSelectElement).value = '0.75';
    (dom.document.querySelector('[name="frameLimit"]') as unknown as HTMLSelectElement).value = '0';
    click('[data-options="apply"]');
    assert.equal(renderScale, 0.75);
    assert.equal(JSON.parse(dom.localStorage.getItem('pocket-flight:preferences')!).data.frameLimit, 0);
    click('[data-options="reset"]'); click('[data-options="apply"]'); assert.equal(renderScale, 1);
    tapKey('Escape'); assert.match(screen(), /Find your rhythm/);
    dispose(); dispose(); assert.equal(disposedViews, 1); assert.equal(callback, undefined);
  } finally {
    dispose?.(); Math.random = random; dom.close();
    for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
  }
});
