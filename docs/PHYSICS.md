# Physics

Physics is optional. A game picks an engine when it is created in **New game**, and **Update tools** can add or remove one later. A game that does not need physics keeps its own rules (Pocket Flight does).

## Engines

| Id | Engine | Units | Package | Import |
| --- | --- | --- | --- | --- |
| `planck` | Planck.js, a Box2D-style 2D engine (MIT) | world units and seconds | `planck` | `gameframework/physics/planck` |
| `matter` | Matter.js, a simple 2D engine (MIT) | pixels and seconds | `matter-js` | `gameframework/physics/matter` |

Both are pure JavaScript and free to use. The list lives in `src/physics/registry.json`, and each engine has an adapter in `src/physics/` that gives the same small interface: `step`, `pose` and `dispose`.

Engines are added and removed one at a time from **Update tools**. Adding copies the adapter, adds its alias and packages, and runs a wiring check. Removing is refused while game code still imports the engine.

## The pattern

1. Create a `FixedStep` and a physics world. The step length is fixed; the frame time is not passed to the engine.
2. Each frame, `fixed.advance(dt, step => physics.step(step))`. Gameplay and physics update together in whole steps.
3. Draw with `physics.pose(body)` and `fixed.alpha` if you interpolate between steps. The renderer only reads positions and angles, so the engine never touches draw objects.
4. On teardown, `physics.dispose()`. It removes every body and blocks further use.

Planck:

```ts
import { FixedStep } from 'gameframework';
import { createPlanckWorld, Circle, Vec2 } from 'gameframework/physics/planck';

const physics = createPlanckWorld({ gravity: { x: 0, y: -10 } });
const ball = physics.world.createBody({ type: 'dynamic', position: Vec2(0, 10) });
ball.createFixture(Circle(0.5), { density: 1 });

const fixed = new FixedStep(1 / 60);
// In the game loop:
fixed.advance(dt, step => physics.step(step));
const { x, y, angle } = physics.pose(ball);
```

Matter.js uses screen coordinates, so a positive `y` pulls bodies down the screen:

```ts
import { createMatterWorld, Bodies, Composite } from 'gameframework/physics/matter';

const physics = createMatterWorld({ gravity: { x: 0, y: 1 } });
const ball = Bodies.circle(100, 50, 16);
Composite.add(physics.world, ball);
// Then step and read it the same way as with Planck.
```

## Rules that keep it working

- Never pass the frame's `dt` directly to the engine. Frame rate would change the result.
- Create and destroy bodies between steps, not inside a callback that runs during a step.
- Check a new engine's licence before adding it. Both engines here are MIT.

## Checks

The build page runs a wiring check before a build. It confirms the engine's files, alias, packages and imports agree, so a missing package or a game import of an engine it does not include is caught before the build starts.

## Tests

`tests/physics-planck.test.ts` and `tests/physics-matter.test.ts` cover the adapters. `tests/wiring.test.ts` covers the wiring check.
