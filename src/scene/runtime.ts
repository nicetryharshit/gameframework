import { FixedStep } from '../framework/fixed-step';
import { Box, Circle, Vec2, createPlanckWorld, type Body } from '../physics/planck';
import { ancestorChain, composeTransforms, getEntity, readTransform, type Scene, type SceneEntity, type Transform2D } from './scene';
import { audioSchema, colliderSchema, defaultsFor, rigidbodySchema } from './schema';

const DEG = Math.PI / 180;
const IDENTITY: Transform2D = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };
const GRAVITY = -9.81;

/** Where a physics body is, in world units and radians. */
export interface Pose {
  readonly x: number;
  readonly y: number;
  readonly angle: number;
}

/** One sound playing or ready to play. The editor's version uses an HTML audio element. */
export interface AudioHandle {
  play(): void | Promise<void>;
  stop(): void;
}

export interface AudioOptions {
  readonly volume: number;
  readonly loop: boolean;
}

export type AudioFactory = (clip: string, options: AudioOptions) => AudioHandle;

export interface SceneRuntimeOptions {
  /** Creates the player for each audio component. Without it, audio components are ignored with a warning. */
  readonly createAudio?: AudioFactory;
  /** Receives things that are ignored or unusual, so they can be shown to the designer. */
  readonly onWarning?: (message: string) => void;
}

export interface SceneRuntime {
  /** World transform of every entity after the latest advance(). */
  readonly worlds: ReadonlyMap<string, Transform2D>;
  /** Moves physics forward by this many seconds, in fixed steps, then updates the world transforms. */
  advance(seconds: number): void;
  /** Stops the sounds and frees the physics world. The scene itself is not changed. */
  dispose(): void;
}

/**
 * World transform of every entity. An entity with a physics pose uses that pose, and its children follow it.
 * Expects a valid scene (no loops, no missing parents); createSceneRuntime checks that first.
 */
export function computeWorlds(scene: Scene, poses: ReadonlyMap<string, Pose> = new Map()): Map<string, Transform2D> {
  const worlds = new Map<string, Transform2D>();
  const resolve = (entity: SceneEntity): Transform2D => {
    const known = worlds.get(entity.id);
    if (known) return known;
    const parent = entity.parent === null ? IDENTITY : resolve(getEntity(scene, entity.parent));
    const composed = composeTransforms(parent, readTransform(entity));
    const pose = poses.get(entity.id);
    const world: Transform2D = pose
      ? { x: pose.x, y: pose.y, rotation: pose.angle / DEG, scaleX: composed.scaleX, scaleY: composed.scaleY }
      : composed;
    worlds.set(entity.id, world);
    return world;
  };
  for (const entity of scene.entities) resolve(entity);
  return worlds;
}

/**
 * Plays a scene: physics for colliders and rigidbodies, the world transforms the renderer draws, and audio that
 * starts on play. Built from an immutable scene, so the editor's own copy is untouched when play stops.
 */
export function createSceneRuntime(scene: Scene, options: SceneRuntimeOptions = {}): SceneRuntime {
  const warn = options.onWarning ?? (() => undefined);
  for (const entity of scene.entities) ancestorChain(scene, entity.id);

  const initial = computeWorlds(scene);
  const physics = createPlanckWorld({ gravity: { x: 0, y: GRAVITY } });
  const bodies = new Map<string, Body>();

  for (const entity of scene.entities) {
    const rigidbody = entity.components.rigidbody;
    if (!entity.components.collider) {
      if (rigidbody) warn(`"${entity.id}" has a rigidbody but no collider, so it will not collide.`);
      continue;
    }
    if (ancestorChain(scene, entity.id).slice(0, -1).some(ancestor => ancestor.components.rigidbody)) {
      warn(`"${entity.id}" has a collider under a rigidbody. Its collider is not simulated separately.`);
      continue;
    }
    const world = initial.get(entity.id) ?? IDENTITY;
    const settings = { ...defaultsFor(rigidbodySchema), ...rigidbody };
    const collider = { ...defaultsFor(colliderSchema), ...entity.components.collider };
    const dynamic = rigidbody !== undefined && settings.type === 'dynamic';
    const body = physics.world.createBody({
      type: dynamic ? 'dynamic' : 'static',
      position: Vec2(world.x, world.y),
      angle: world.rotation * DEG
    });
    const sx = Math.max(Math.abs(world.scaleX), 0.001);
    const sy = Math.max(Math.abs(world.scaleY), 0.001);
    const shape =
      collider.shape === 'circle'
        ? Circle(Math.max(sx, sy) * Math.max(Number(collider.radius), 0.001))
        : Box(Math.max((sx * Number(collider.width)) / 2, 0.001), Math.max((sy * Number(collider.height)) / 2, 0.001));
    body.createFixture(shape, {
      density: dynamic ? Number(settings.density) : 0,
      restitution: Number(settings.bounce)
    });
    if (dynamic) body.setGravityScale(Number(settings.gravityScale));
    bodies.set(entity.id, body);
  }

  const handles: AudioHandle[] = [];
  for (const entity of scene.entities) {
    const data = entity.components.audio;
    if (!data) continue;
    const settings = { ...defaultsFor(audioSchema), ...data };
    const clip = String(settings.clip);
    if (clip === '') continue;
    if (!options.createAudio) {
      warn(`"${entity.id}" has audio, but no audio player was given.`);
      continue;
    }
    const handle = options.createAudio(clip, { volume: Number(settings.volume), loop: settings.loop === true });
    handles.push(handle);
    if (settings.playOnStart === true) void handle.play();
  }

  const fixed = new FixedStep(1 / 60, 5);
  let worlds: Map<string, Transform2D> = initial;
  let disposed = false;

  return {
    get worlds() {
      return worlds;
    },
    advance(seconds) {
      if (disposed) throw new Error('This scene runtime was disposed.');
      fixed.advance(seconds, step => physics.step(step));
      const poses = new Map<string, Pose>();
      for (const [id, body] of bodies) poses.set(id, physics.pose(body));
      worlds = computeWorlds(scene, poses);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const handle of handles) handle.stop();
      physics.dispose();
    }
  };
}
