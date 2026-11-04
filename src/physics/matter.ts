import Matter from 'matter-js';

// matter-js is CommonJS, which Node's ESM loader cannot read through named imports. Take the values from the default export.
const { Bodies, Body, Composite, Engine } = Matter;
export { Bodies, Body, Composite };

export interface PhysicsWorld {
  /** The Matter engine. Its world holds the bodies. */
  readonly engine: Matter.Engine;
  /** The engine's world. Add bodies with Composite.add(physics.world, body). */
  readonly world: Matter.Composite;
  /** Advances by one step. Pass the step from FixedStep so every step has the same length. */
  step(seconds: number): void;
  /** Reads a body's position and angle for drawing. Position is in pixels, angle in radians. */
  pose(body: Matter.Body): { x: number; y: number; angle: number };
  /** Removes every body and stops the world from being used. */
  dispose(): void;
}

export interface PhysicsOptions {
  /**
   * Gravity in pixels per second squared. Matter.js uses screen coordinates, so y grows downward:
   * a positive y pulls bodies down the screen. Defaults to none.
   */
  gravity?: { x: number; y: number };
}

/** Matter.js scales gravity by 0.001 pixels per millisecond squared. Dividing by 1000 gives pixels per second squared. */
const GRAVITY_PER_UNIT = 1000;

/**
 * A 2D physics world built on matter.js (MIT). Units are pixels and seconds. The framework does not drive it;
 * the game calls step() from a FixedStep so the simulation does not depend on frame rate.
 */
export function createMatterWorld(options: PhysicsOptions = {}): PhysicsWorld {
  const engine = Engine.create();
  engine.gravity.x = (options.gravity?.x ?? 0) / GRAVITY_PER_UNIT;
  engine.gravity.y = (options.gravity?.y ?? 0) / GRAVITY_PER_UNIT;
  const world = engine.world;
  let disposed = false;
  const assertLive = () => { if (disposed) throw new Error('This physics world was disposed.'); };
  return {
    engine, world,
    step(seconds) {
      assertLive();
      if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('Invalid physics step');
      Engine.update(engine, seconds * 1000);
    },
    pose(body) {
      assertLive();
      return { x: body.position.x, y: body.position.y, angle: body.angle };
    },
    dispose() {
      if (disposed) return;
      Composite.clear(world, false);
      Engine.clear(engine);
      disposed = true;
    }
  };
}

