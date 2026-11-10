/** Example gameplay only. This file is safe to delete when starting your own game. */
export const flight = { width: 480, height: 720, floor: 660, birdX: 120, radius: 16, gap: 190, pipeWidth: 72, speed: 155, gravity: 1050, flapSpeed: -340 };
export interface Pipe { x: number; center: number; scored: boolean }

/** Name of the scene component that holds the bird's designer-tunable values. */
export const FLAPPY_BIRD = 'flappy-bird';
/** Keys a designer can pick for jumping. The editor shows them as a dropdown. */
export const jumpKeys = ['Space', 'Enter', 'ArrowUp', 'KeyW', 'KeyZ', 'KeyX', 'ShiftLeft', 'ShiftRight'] as const;
/** Allowed ranges for the bird's values. The editor enforces the same ranges. */
export const birdLimits = { size: [8, 160], jumpSpeed: [50, 1000], gravity: [0, 4000] } as const;

export interface FlappyTuning { readonly radius: number; readonly jumpSpeed: number; readonly gravity: number; readonly jumpKey: string }

export const defaultTuning: FlappyTuning = { radius: flight.radius, jumpSpeed: -flight.flapSpeed, gravity: flight.gravity, jumpKey: 'Space' };

type Loose = Record<string, unknown>;
const isRecord = (value: unknown): value is Loose => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Reads the bird's values from scene JSON text. Undefined text gives the defaults. Values outside their range
 * or of the wrong type fall back to the defaults, so a broken scene still starts the game. Throws only when
 * the text is not JSON at all.
 */
export function tuningFromScene(text: string | undefined): FlappyTuning {
  if (text === undefined) return defaultTuning;
  const file: unknown = JSON.parse(text);
  const entities = isRecord(file) && Array.isArray(file.entities) ? file.entities : [];
  const bird = entities
    .map(entity => (isRecord(entity) && isRecord(entity.components) ? entity.components[FLAPPY_BIRD] : undefined))
    .find((data): data is Loose => isRecord(data));
  const number = (value: unknown, fallback: number, [min, max]: readonly [number, number]) =>
    typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : fallback;
  return {
    radius: number(bird?.size, defaultTuning.radius * 2, birdLimits.size) / 2,
    jumpSpeed: number(bird?.jumpSpeed, defaultTuning.jumpSpeed, birdLimits.jumpSpeed),
    gravity: number(bird?.gravity, defaultTuning.gravity, birdLimits.gravity),
    jumpKey: typeof bird?.jumpKey === 'string' && (jumpKeys as readonly string[]).includes(bird.jumpKey) ? bird.jumpKey : defaultTuning.jumpKey
  };
}

export class FlappyGame {
  y = 300;
  velocity = 0;
  score = 0;
  dead = false;
  readonly pipes: Pipe[] = [];
  constructor(private random: () => number = Math.random, readonly tuning: FlappyTuning = defaultTuning) { this.reset(); }
  reset(): void {
    this.y = 300; this.velocity = 0; this.score = 0; this.dead = false;
    this.pipes.length = 0; this.addPipe(580); this.addPipe(840); this.addPipe(1100);
  }
  private addPipe(x: number): void { this.pipes.push({ x, center: 200 + this.random() * 260, scored: false }); }
  flap(): void { if (!this.dead) this.velocity = -this.tuning.jumpSpeed; }
  /** Bounded substeps make collision reliable across ordinary frame stalls. */
  update(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0 || this.dead) return;
    const { radius, gravity } = this.tuning;
    let remaining = Math.min(dt, 0.1);
    while (remaining > 0 && !this.dead) {
      const step = Math.min(remaining, 1 / 120); remaining -= step;
      this.velocity += gravity * step; this.y += this.velocity * step;
      if (this.y - radius <= 0 || this.y + radius >= flight.floor) this.dead = true;
      for (const pipe of this.pipes) {
        pipe.x -= flight.speed * step;
        // Circle against the two pipe rectangles, including rounded corner distance.
        const closestX = Math.max(pipe.x, Math.min(flight.birdX, pipe.x + flight.pipeWidth));
        const dx = flight.birdX - closestX;
        const top = pipe.center - flight.gap / 2, bottom = pipe.center + flight.gap / 2;
        const topDistance = Math.max(0, this.y - top), bottomDistance = Math.max(0, bottom - this.y);
        if (dx * dx + Math.min(topDistance * topDistance, bottomDistance * bottomDistance) <= radius * radius) this.dead = true;
        if (!this.dead && !pipe.scored && pipe.x + flight.pipeWidth < flight.birdX - radius) { pipe.scored = true; this.score++; }
      }
      if (this.pipes[0].x + flight.pipeWidth < 0) {
        const old = this.pipes.shift()!;
        old.x = this.pipes[this.pipes.length - 1].x + 260;
        old.center = 200 + this.random() * 260; old.scored = false; this.pipes.push(old);
      }
    }
  }
}
