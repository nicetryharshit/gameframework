import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatterWorld, Bodies, Composite } from '../src/physics/matter';
import { FixedStep } from '../src/framework/fixed-step';

test('a dynamic body falls under gravity and is read back as a pose', () => {
  const physics = createMatterWorld({ gravity: { x: 0, y: 1000 } });
  const ball = Bodies.circle(0, 0, 20);
  Composite.add(physics.world, ball);
  for (let i = 0; i < 60; i++) physics.step(1 / 60);
  const { y, angle } = physics.pose(ball);
  // One second of free fall from rest drops 500 pixels. Air friction and the integrator make it a little less.
  assert.ok(y > 380 && y < 520, `y was ${y}`);
  assert.equal(typeof angle, 'number');
  physics.dispose();
});

test('a falling body stops on static ground instead of passing through it', () => {
  const physics = createMatterWorld({ gravity: { x: 0, y: 1000 } });
  // The ground's top edge is at y = 280 (centre 300, height 40).
  Composite.add(physics.world, Bodies.rectangle(0, 300, 1000, 40, { isStatic: true }));
  const ball = Bodies.circle(0, 0, 20);
  Composite.add(physics.world, ball);
  for (let i = 0; i < 300; i++) physics.step(1 / 60);
  const { y } = physics.pose(ball);
  // The ball's radius is 20, so it rests with its centre near y = 260.
  assert.ok(y > 240 && y < 270, `ball rested at ${y}`);
  physics.dispose();
});

test('with FixedStep, the same time gives the same result regardless of frame rate', () => {
  const simulate = (frameTime: number) => {
    const physics = createMatterWorld({ gravity: { x: 0, y: 1000 } });
    const ball = Bodies.circle(0, 0, 20);
    Composite.add(physics.world, ball);
    const fixed = new FixedStep(1 / 60);
    for (let elapsed = 0; elapsed < 1 - 1e-9; elapsed += frameTime) {
      fixed.advance(frameTime, step => physics.step(step));
    }
    const pose = physics.pose(ball);
    physics.dispose();
    return pose;
  };
  const slow = simulate(1 / 30);
  const fast = simulate(1 / 120);
  assert.ok(Math.abs(slow.y - fast.y) < 1e-6, `${slow.y} vs ${fast.y}`);
});

test('invalid steps are rejected, and disposing empties the world and blocks further use', () => {
  const physics = createMatterWorld();
  Composite.add(physics.world, Bodies.circle(0, 0, 10));
  assert.throws(() => physics.step(0), /Invalid physics step/);
  physics.dispose();
  assert.equal(physics.world.bodies.length, 0);
  assert.throws(() => physics.step(1 / 60), /disposed/);
  physics.dispose(); // safe to call twice
});
