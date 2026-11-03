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
