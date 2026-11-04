import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FixedStep } from '../src/framework/fixed-step';

test('fixed steps run whole steps and carry leftover time into the next frame', () => {
  const fixed = new FixedStep(1 / 60);
  let steps = 0;
  const count = () => { steps++; };
  // Sixty frames of 1/60 s make exactly one second of steps, even with float rounding.
  for (let frame = 0; frame < 60; frame++) fixed.advance(1 / 60, count);
  assert.equal(steps, 60);

  // Six frames of 0.01 s are 0.06 s, which is three whole steps.
  steps = 0;
  const carry = new FixedStep(1 / 60);
  for (let frame = 0; frame < 6; frame++) carry.advance(0.01, count);
  assert.equal(steps, 3);
});

test('a long stall runs at most maxSteps and drops the rest of the backlog', () => {
  const fixed = new FixedStep(1 / 60, 5);
  let steps = 0;
  assert.equal(fixed.advance(1, () => { steps++; }), 5);
  assert.equal(steps, 5);
  // The backlog was dropped, so the next normal frame runs one step rather than replaying the stall.
  assert.equal(fixed.advance(1 / 60, () => { steps++; }), 1);
  assert.equal(steps, 6);
});

test('alpha reports how far the next step has progressed', () => {
  const fixed = new FixedStep(1 / 60);
  assert.equal(fixed.advance(0.025, () => {}), 1);
  assert.ok(Math.abs(fixed.alpha - 0.5) < 1e-6, `alpha was ${fixed.alpha}`);
  fixed.reset();
  assert.equal(fixed.alpha, 0);
  assert.equal(fixed.advance(0.01, () => {}), 0, 'reset dropped the leftover time');
});

test('invalid time and settings are rejected or ignored', () => {
  const fixed = new FixedStep(1 / 60);
  let steps = 0;
  for (const dt of [0, -1, NaN, Infinity]) assert.equal(fixed.advance(dt, () => { steps++; }), 0);
  assert.equal(steps, 0);
  assert.throws(() => new FixedStep(0), /Invalid step/);
  assert.throws(() => new FixedStep(1 / 60, 0), /Invalid maximum steps/);
  assert.throws(() => new FixedStep(1 / 60, 2.5), /Invalid maximum steps/);
});

test('the same frame times always give the same steps', () => {
  const frames = [0.016, 0.033, 0.009, 0.25, 0.017, 0.5, 0.016];
  const run = () => {
    const fixed = new FixedStep(1 / 60);
    const log: number[] = [];
    for (const dt of frames) fixed.advance(dt, step => log.push(step));
    return log.length;
  };
  assert.equal(run(), run());
});
