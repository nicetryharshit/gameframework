import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPlanckWorld, Box, Circle, Vec2 } from '../src/physics/planck';
import { FixedStep } from '../src/framework/fixed-step';

test('a dynamic body falls under gravity and is read back as a pose', () => {
  const physics = createPlanckWorld({ gravity: { x: 0, y: -10 } });
  const ball = physics.world.createBody({ type: 'dynamic', position: Vec2(0, 10) });
  ball.createFixture(Circle(0.5), { density: 1 });
  for (let i = 0; i < 60; i++) physics.step(1 / 60);
  const { y, angle } = physics.pose(ball);
  // One second of free fall from rest drops about 5 units. Semi-implicit Euler lands a little lower.
  assert.ok(Math.abs(y - 5) < 0.2, `y was ${y}`);
  assert.equal(typeof angle, 'number');
  physics.dispose();
});

test('a falling body stops on static ground instead of passing through it', () => {
  const physics = createPlanckWorld({ gravity: { x: 0, y: -10 } });
  const ground = physics.world.createBody({ type: 'static', position: Vec2(0, 0) });
  ground.createFixture(Box(10, 0.5));
  const ball = physics.world.createBody({ type: 'dynamic', position: Vec2(0, 5) });
  ball.createFixture(Circle(0.5), { density: 1, restitution: 0 });
  for (let i = 0; i < 600; i++) physics.step(1 / 60);
  const { y } = physics.pose(ball);
  // Ground top is at y = 0.5; the ball's radius is 0.5, so it rests near y = 1.
  assert.ok(y > 0.9 && y < 1.2, `ball rested at ${y}`);
  physics.dispose();
});

test('with FixedStep, the same time gives the same result regardless of frame rate', () => {
  const simulate = (frameTime: number) => {
    const physics = createPlanckWorld({ gravity: { x: 0, y: -10 } });
    const ball = physics.world.createBody({ type: 'dynamic', position: Vec2(0, 10) });
    ball.createFixture(Circle(0.5), { density: 1 });
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

test('invalid steps are rejected, and disposing removes bodies and blocks further use', () => {
  const physics = createPlanckWorld();
  physics.world.createBody({ type: 'dynamic', position: Vec2(0, 0) });
  assert.throws(() => physics.step(0), /Invalid physics step/);
  physics.dispose();
  assert.equal(physics.world.getBodyList(), null);
  assert.throws(() => physics.step(1 / 60), /disposed/);
  physics.dispose(); // safe to call twice
});
