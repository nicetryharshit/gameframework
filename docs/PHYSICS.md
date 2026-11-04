# Physics

Physics is optional. The framework does not bundle an engine: a game that needs one adds it, and a game that does not keeps its own rules (Pocket Flight does).

## Status

- `src/physics/planck.ts` is an adapter for Planck.js 2D (`planck` 1.5.1, MIT, pinned in `devDependencies`).
- `src/physics/registry.json` lists the options: `none` (the default) and `planck`.
- Not yet wired into **New game** or generated games. Generated games copy only the components in `scripts/create-game.mjs`, which do not include `src/physics`. Wiring is the next physics step.

## The pattern

1. Create a `FixedStep` and a physics world. The step length is fixed; the frame time is not passed to the engine.
2. Each frame, `fixed.advance(dt, step => physics.step(step))`. Gameplay and physics update together in whole steps.
3. Draw with `physics.pose(body)` and `fixed.alpha` if you interpolate between steps. The renderer only reads positions and angles, so the engine never touches draw objects.
4. On teardown, `physics.dispose()`. It removes every body and blocks further use.

```ts
import { FixedStep } from 'gameframework';
import { createPlanckWorld, Circle, Vec2 } from './physics/planck';

const physics = createPlanckWorld({ gravity: { x: 0, y: -10 } });
const ball = physics.world.createBody({ type: 'dynamic', position: Vec2(0, 10) });
ball.createFixture(Circle(0.5), { density: 1 });

const fixed = new FixedStep(1 / 60);
// In the game loop:
fixed.advance(dt, step => physics.step(step));
const { x, y, angle } = physics.pose(ball);
```

## Rules that keep it working

- Never pass the frame's `dt` directly to the engine. Frame rate would change the result.
- Create and destroy bodies between steps, not inside a callback that runs during a step.
- Check a new engine's licence and release date before pinning it. Two weeks is the minimum age the framework asks for.

## Tests

`tests/physics-planck.test.ts` covers free fall, landing on static ground, the same result at two frame rates through `FixedStep`, and disposal.
