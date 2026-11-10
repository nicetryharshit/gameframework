import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FlappyGame, flight } from '../src/flappy';

test('flap counters gravity; floor ends run; reset gives a clean game', () => {
  const game = new FlappyGame(() => 0.5);
  game.flap(); game.update(0.05); assert.ok(game.y < 300);
  for (let i = 0; i < 100; i++) game.update(0.05);
  assert.equal(game.dead, true);
  const y = game.y; game.flap(); game.update(0.05); assert.equal(game.y, y);
  game.reset(); assert.equal(game.dead, false); assert.equal(game.score, 0); assert.equal(game.velocity, 0); assert.equal(game.pipes.length, 3);
});
test('passing a pipe scores once; a pipe collision ends the run', () => {
  const game = new FlappyGame(() => 0.5);
  game.pipes[0].x = flight.birdX - flight.pipeWidth - flight.radius - 1;
  game.update(0.001); assert.equal(game.score, 1); game.update(0.001); assert.equal(game.score, 1);
  game.reset(); game.pipes[0].x = flight.birdX; game.y = 100;
  game.update(0.001); assert.equal(game.dead, true); assert.equal(game.score, 0);
});
test('safe gap does not collide; pipes recycle without unbounded spawning', () => {
  const game = new FlappyGame(() => 0.5);
  game.pipes[0].x = flight.birdX; game.y = game.pipes[0].center;
  game.update(0.001); assert.equal(game.dead, false);
  game.pipes[0].x = -flight.pipeWidth - 1;
  const recycled = game.pipes[0]; game.update(0.001);
  assert.equal(game.pipes.length, 3); assert.equal(game.pipes[2], recycled); assert.ok(recycled.x > game.pipes[1].x);
});
test('different ordinary frame sizes produce the same flight trajectory', () => {
  const a = new FlappyGame(() => 0.5), b = new FlappyGame(() => 0.5);
  a.flap(); b.flap();
  for (let i = 0; i < 6; i++) a.update(1 / 60);
  for (let i = 0; i < 3; i++) b.update(1 / 30);
  assert.ok(Math.abs(a.y - b.y) < 0.00001);
});

// Scene-driven bird settings (see docs/EDITOR.md and scenes/flappy.scene.json).
import { readFileSync } from 'node:fs';
import { defaultTuning, tuningFromScene } from '../src/flappy';
import { flappyBirdSchema } from '../src/flappy-schema';
import { createDefaultRegistry } from '../src/scene/index';

const birdScene = (components: Record<string, unknown>) => JSON.stringify({ format: 'gameframework.scene', version: 1, entities: [{ id: 'bird', components: { 'flappy-bird': components } }] });

test('the bird reads its size, jump speed, gravity and key from a scene', () => {
  const tuning = tuningFromScene(birdScene({ size: 64, jumpSpeed: 500, gravity: 800, jumpKey: 'KeyZ' }));
  assert.equal(tuning.radius, 32);
  assert.equal(tuning.jumpSpeed, 500);
  assert.equal(tuning.gravity, 800);
  assert.equal(tuning.jumpKey, 'KeyZ');
  const game = new FlappyGame(() => 0.5, tuning);
  game.flap();
  assert.equal(game.velocity, -500);
});

test('invalid bird values fall back to the defaults', () => {
  const tuning = tuningFromScene(birdScene({ jumpKey: 'F13', jumpSpeed: 'fast' }));
  assert.equal(tuning.jumpKey, 'Space');
  assert.equal(tuning.jumpSpeed, defaultTuning.jumpSpeed);
});

test('no scene, or a scene without a bird, gives the defaults', () => {
  assert.deepEqual(tuningFromScene(undefined), defaultTuning);
  assert.deepEqual(tuningFromScene(JSON.stringify({ format: 'gameframework.scene', version: 1, entities: [] })), defaultTuning);
});

test('the shipped scene matches the built-in defaults', () => {
  const text = readFileSync(new URL('../scenes/flappy.scene.json', import.meta.url), 'utf8');
  assert.deepEqual(tuningFromScene(text), defaultTuning);
});

test('the editor schema defaults match the game defaults', () => {
  const fields = flappyBirdSchema.fields;
  assert.equal(fields.size.default, defaultTuning.radius * 2);
  assert.equal(fields.jumpSpeed.default, defaultTuning.jumpSpeed);
  assert.equal(fields.gravity.default, defaultTuning.gravity);
  assert.equal(fields.jumpKey.default, defaultTuning.jumpKey);
  assert.ok(createDefaultRegistry().register(flappyBirdSchema).get('flappy-bird'));
});

test('values outside their range fall back to the default', () => {
  const tuning = tuningFromScene(birdScene({ size: 4000, gravity: -5 }));
  assert.equal(tuning.radius, defaultTuning.radius);
  assert.equal(tuning.gravity, defaultTuning.gravity);
});
