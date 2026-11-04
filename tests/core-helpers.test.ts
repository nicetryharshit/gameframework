import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTimers } from '../src/framework/timers';
import { createRandom } from '../src/framework/random';
import { createFrameAnimation } from '../src/framework/animation';
import { easing, tween } from '../src/framework/tween';
import { createLocalizer } from '../src/framework/localization';

test('a one-shot timer fires once after its delay, and stopping it cancels it', () => {
  const timers = createTimers();
  let fired = 0;
  timers.after(1, () => fired++);
  timers.update(0.5);
  assert.equal(fired, 0);
  timers.update(0.5);
  assert.equal(fired, 1);
  timers.update(5);
  assert.equal(fired, 1);

  const stop = timers.after(1, () => fired++);
  stop();
  timers.update(2);
  assert.equal(fired, 1);
});

test('a repeating timer keeps the leftover time between updates', () => {
  const timers = createTimers();
  let count = 0;
  timers.every(0.25, () => count++);
  timers.update(0.6);
  assert.equal(count, 2);
  timers.update(0.2);
  assert.equal(count, 3);
});

test('clear stops every timer, and timers added during a callback start on the next update', () => {
  const timers = createTimers();
  const log: string[] = [];
  timers.after(0.1, () => {
    log.push('first');
    timers.after(0.1, () => log.push('chained'));
  });
  timers.every(1, () => log.push('repeat'));
  timers.update(0.1);
  assert.deepEqual(log, ['first']);
  timers.update(0.1);
  assert.deepEqual(log, ['first', 'chained']);

  timers.clear();
  assert.equal(timers.count, 0);
  timers.update(10);
  assert.deepEqual(log, ['first', 'chained']);
});

test('timers reject zero or negative delays and negative steps', () => {
  const timers = createTimers();
  assert.throws(() => timers.after(0, () => {}), /positive/);
  assert.throws(() => timers.every(-1, () => {}), /positive/);
  assert.throws(() => timers.update(-0.1), /zero or more/);
});

test('the same seed gives the same sequence, and a different seed gives a different one', () => {
  const run = (seed: number) => {
    const random = createRandom(seed);
    return Array.from({ length: 5 }, () => random.int(1, 100));
  };
  assert.deepEqual(run(42), run(42));
  assert.notDeepEqual(run(42), run(43));
});

test('random values stay in their ranges', () => {
  const random = createRandom(7);
  for (let i = 0; i < 1000; i++) {
    const next = random.next();
    assert.ok(next >= 0 && next < 1);
    const whole = random.int(1, 6);
    assert.ok(Number.isInteger(whole) && whole >= 1 && whole <= 6);
    const range = random.range(2, 3);
    assert.ok(range >= 2 && range < 3);
    assert.ok(['a', 'b'].includes(random.pick(['a', 'b'])));
  }
});

test('random rejects bad seeds and bad arguments', () => {
  assert.throws(() => createRandom(Number.NaN), /finite/);
  const random = createRandom(1);
  assert.throws(() => random.int(2, 1), /whole numbers/);
  assert.throws(() => random.int(1.5, 3), /whole numbers/);
  assert.throws(() => random.range(3, 2), /min <= max/);
  assert.throws(() => random.pick([]), /at least one item/);
});

test('a looping animation cycles through its frames at its speed', () => {
  const animation = createFrameAnimation(['a', 'b', 'c'], { fps: 10 });
  assert.equal(animation.frame, 'a');
  animation.update(0.1);
  assert.equal(animation.frame, 'b');
  animation.update(0.1);
  animation.update(0.1);
  assert.equal(animation.frame, 'a');
  assert.equal(animation.done, false);
});

test('a one-time animation holds its last frame and reports done after it', () => {
  const animation = createFrameAnimation(['a', 'b'], { fps: 10, loop: false });
  animation.update(0.1);
  assert.equal(animation.frame, 'b');
  assert.equal(animation.done, false);
  animation.update(0.1);
  assert.equal(animation.frame, 'b');
  assert.equal(animation.done, true);
  animation.reset();
  assert.equal(animation.frame, 'a');
  assert.equal(animation.done, false);
});

test('animations reject empty frame lists, bad speeds and negative steps', () => {
  assert.throws(() => createFrameAnimation([], { fps: 10 }), /at least one frame/);
  assert.throws(() => createFrameAnimation(['a'], { fps: 0 }), /positive/);
  assert.throws(() => createFrameAnimation(['a'], { fps: 10 }).update(-1), /zero or more/);
});

test('every easing starts at 0 and ends at 1', () => {
  for (const [name, curve] of Object.entries(easing)) {
    assert.ok(Math.abs(curve(0)) < 1e-9, `${name} starts at 0`);
    assert.ok(Math.abs(curve(1) - 1) < 1e-9, `${name} ends at 1`);
  }
});

test('a tween moves values to their targets over time, and calls onDone once', () => {
  const sprite = { x: 0, alpha: 1 };
  let done = 0;
  const move = tween(sprite, { x: 100, alpha: 0 }, 1, { easing: easing.linear, onDone: () => done++ });
  move.update(0.5);
  assert.equal(sprite.x, 50);
  assert.equal(sprite.alpha, 0.5);
  move.update(0.5);
  assert.equal(sprite.x, 100);
  assert.equal(move.done, true);
  assert.equal(done, 1);
  move.update(1);
  assert.equal(done, 1);
  assert.equal(sprite.x, 100);
});

test('a zero-length tween applies its targets on the first update', () => {
  const box = { y: 0 };
  const drop = tween(box, { y: 40 }, 0);
  drop.update(0);
  assert.equal(box.y, 40);
  assert.equal(drop.done, true);
});

test('cancelling a tween leaves values where they are and does not call onDone', () => {
  const box = { x: 0 };
  let done = 0;
  const move = tween(box, { x: 10 }, 1, { easing: easing.linear, onDone: () => done++ });
  move.update(0.5);
  move.cancel();
  move.update(1);
  assert.equal(box.x, 5);
  assert.equal(done, 0);
});

test('a tween rejects negative times', () => {
  assert.throws(() => tween({ x: 0 }, { x: 1 }, -1), /zero or more/);
});

test('looks up text in the chosen language, falls back to the first language, and fills in values', () => {
  const text = createLocalizer({
    en: { play: 'Play', quit: 'Quit', greet: 'Hello {name}' },
    fr: { play: 'Jouer' },
  } as const);
  assert.equal(text.locale, 'en');
  assert.deepEqual(text.locales, ['en', 'fr']);
  assert.equal(text.t('play'), 'Play');
  text.setLocale('fr');
  assert.equal(text.t('play'), 'Jouer');
  assert.equal(text.t('quit'), 'Quit');
  assert.equal(text.t('greet', { name: 'Ana' }), 'Hello Ana');
  assert.equal(text.t('greet'), 'Hello {name}');
});

test('an unknown language is rejected, and a key missing everywhere is shown as the key', () => {
  const text = createLocalizer({ en: { play: 'Play' }, fr: { play: 'Jouer' } } as const);
  assert.throws(() => text.setLocale('de' as never), /Unknown language: de/);
  assert.equal(text.t('nope' as never), 'nope');
  assert.throws(() => createLocalizer({}), /at least one language/);
});

test('text lookups ignore built-in property names', () => {
  const text = createLocalizer({ en: { play: 'Play' } } as const);
  assert.equal(text.t('toString' as never), 'toString');
});
