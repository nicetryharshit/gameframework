import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Input, VersionedSaveStore, fitViewport, clientToGame, StateManager, AppLifecycle, GameLoop } from '../src/framework';

test('input edges, analog dead zones, independent virtual sources, rebinding and blur', () => {
  const target = new EventTarget() as EventTarget & { navigator: unknown };
  const pad = { connected: true, axes: [0.1], buttons: [] };
  target.navigator = { getGamepads: () => [pad] };
  const input = new Input({ right: { axes: [{ index: 0, direction: 1 }] } }, target as unknown as Window);
  input.update(); assert.equal(input.value('right'), 0);
  pad.axes[0] = 0.6; input.update(); assert.ok(Math.abs(input.value('right') - 0.5) < 0.001); assert.equal(input.pressed('right'), true);
  input.update(); assert.equal(input.pressed('right'), false);
  pad.axes[0] = 0;
  const a = {}, b = {};
  input.setVirtual('right', true, a); input.setVirtual('right', true, b); input.setVirtual('right', false, a);
  input.update(); assert.equal(input.held('right'), true);
  input.setVirtual('right', false, b); input.update(); assert.equal(input.released('right'), true);
  input.bind('right', { buttons: [0] }); input.update(); assert.equal(input.value('right'), 0);
  input.setVirtual('right', true); input.update(); target.dispatchEvent(new Event('blur')); assert.equal(input.held('right'), false);
  input.dispose(); input.dispose();
});

test('save migrations validate data and preserve rejected or future saves', () => {
  const data = new Map<string, string>([['game:slot', JSON.stringify({ version: 1, data: 7 })]]);
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } };
  const saves = new VersionedSaveStore('game', { version: 2, validate: (value): value is { score: number } => !!value && typeof (value as { score: number }).score === 'number', migrate: value => ({ score: value }) }, storage);
  assert.deepEqual(saves.load('slot'), { ok: true, value: { score: 7 } });
  data.set('game:slot', '{'); assert.equal(saves.load('slot').ok, false); assert.equal(data.get('game:slot'), '{');
  data.set('game:slot', JSON.stringify({ version: 99, data: {} })); assert.equal(saves.load('slot').ok, false);
  assert.equal(saves.save('other', { score: 10 }).ok, true); assert.deepEqual(saves.load('other'), { ok: true, value: { score: 10 } });
  assert.deepEqual(saves.load('empty'), { ok: true, value: undefined });
});

test('storage failures are returned, not mistaken for missing saves', () => {
  const fail = () => { throw new Error('quota or access denied'); };
  const saves = new VersionedSaveStore('game', { version: 1, validate: (value): value is number => typeof value === 'number' }, { getItem: fail, setItem: fail, removeItem: fail });
  assert.equal(saves.load('slot').ok, false); assert.equal(saves.save('slot', 1).ok, false); assert.equal(saves.remove('slot').ok, false);
});

test('viewport fit and input coordinates agree across letterboxing', () => {
  const layout = fitViewport(1000, 1000, 800, 400);
  assert.deepEqual(layout, { width: 1000, height: 500, scale: 1.25, x: 0, y: 250 });
  assert.deepEqual(clientToGame(510, 520, { left: 10, top: 20 }, layout), { x: 400, y: 200 });
  assert.throws(() => fitViewport(0, 100, 800, 400));
});

test('state cycles fail with a useful error; disposal prevents resurrection', () => {
  const states = new StateManager({});
  states.register('a', { enter: () => states.change('b') }).register('b', { enter: () => states.change('a') });
  assert.throws(() => states.change('a'), /cycle/);
  states.dispose(); states.dispose(); assert.throws(() => states.change('a'), /disposed/);
});

test('lifecycle coalesces background signals and requires explicit resume', () => {
  const target = new EventTarget(); const document = Object.assign(new EventTarget(), { hidden: false });
  let pauses = 0;
  const lifecycle = new AppLifecycle(() => pauses++, document as unknown as Document, target as unknown as Window);
  target.dispatchEvent(new Event('blur')); document.hidden = true; document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(pauses, 1); assert.equal(lifecycle.resume(), false);
  document.hidden = false; assert.equal(lifecycle.resume(), true); target.dispatchEvent(new Event('blur')); assert.equal(pauses, 2);
  lifecycle.dispose(); target.dispatchEvent(new Event('blur')); assert.equal(pauses, 2);
});

test('loop clamps stalls, stops on errors and can restart', () => {
  let callback: FrameRequestCallback = () => {}; let cancellations = 0;
  const originalRequest = globalThis.requestAnimationFrame, originalCancel = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = cb => { callback = cb; return 1; };
  globalThis.cancelAnimationFrame = () => { cancellations++; };
  try {
    const deltas: number[] = []; let fail = false;
    const loop = new GameLoop(dt => { if (fail) throw new Error('update'); deltas.push(dt); });
    loop.start(); callback(0); callback(10000); assert.deepEqual(deltas, [0, 0.1]);
    fail = true; assert.throws(() => callback(11000), /update/); assert.equal(cancellations, 1);
    fail = false; loop.start(); callback(12000); assert.equal(deltas.at(-1), 0); loop.stop();
  } finally { globalThis.requestAnimationFrame = originalRequest; globalThis.cancelAnimationFrame = originalCancel; }
});
