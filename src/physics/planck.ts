import { Vec2, World, type Body } from 'planck';

export type { Body } from 'planck';
export { Box, Circle, Polygon, Vec2 } from 'planck';

export interface PhysicsWorld {
  /** The Planck world. Create bodies and fixtures on it directly. */
  readonly world: World;
  /** Advances by one step. Pass the step from FixedStep so every step has the same length. */
  step(seconds: number): void;
  /** Reads a body's position and angle for drawing. Position is in world units, angle in radians. */
  pose(body: Body): { x: number; y: number; angle: number };
  /** Removes every body and stops the world from being used. */
  dispose(): void;
}

export interface PhysicsOptions {
  /** Gravity in world units per second squared. Defaults to none. */
  gravity?: { x: number; y: number };
}

/**
 * A 2D physics world built on Planck.js. The framework does not drive it; the game calls step() from a FixedStep so
 * the simulation does not depend on frame rate. Renderers read poses, so the physics engine never touches draw objects.
 */
export function createPlanckWorld(options: PhysicsOptions = {}): PhysicsWorld {
  const world = World({ gravity: Vec2(options.gravity?.x ?? 0, options.gravity?.y ?? 0) });
  let disposed = false;
  const assertLive = () => { if (disposed) throw new Error('This physics world was disposed.'); };
  return {
    world,
    step(seconds) {
      assertLive();
      if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('Invalid physics step');
      world.step(seconds);
    },
    pose(body) {
      assertLive();
      const position = body.getPosition();
      return { x: position.x, y: position.y, angle: body.getAngle() };
    },
    dispose() {
      if (disposed) return;
      for (let body = world.getBodyList(); body; ) {
        const next = body.getNext();
        world.destroyBody(body);
        body = next;
      }
      disposed = true;
    }
  };
}
