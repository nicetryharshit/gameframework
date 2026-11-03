/** Example gameplay only. This file is safe to delete when starting your own game. */
export const flight = { width: 480, height: 720, floor: 660, birdX: 120, radius: 16, gap: 190, pipeWidth: 72, speed: 155, gravity: 1050, flapSpeed: -340 };
export interface Pipe { x: number; center: number; scored: boolean }

export class FlappyGame {
  y = 300;
  velocity = 0;
  score = 0;
  dead = false;
  readonly pipes: Pipe[] = [];
  constructor(private random: () => number = Math.random) { this.reset(); }
  reset(): void {
    this.y = 300; this.velocity = 0; this.score = 0; this.dead = false;
    this.pipes.length = 0; this.addPipe(580); this.addPipe(840); this.addPipe(1100);
  }
  private addPipe(x: number): void { this.pipes.push({ x, center: 200 + this.random() * 260, scored: false }); }
  flap(): void { if (!this.dead) this.velocity = flight.flapSpeed; }
  /** Bounded substeps make collision reliable across ordinary frame stalls. */
  update(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0 || this.dead) return;
    let remaining = Math.min(dt, 0.1);
    while (remaining > 0 && !this.dead) {
      const step = Math.min(remaining, 1 / 120); remaining -= step;
      this.velocity += flight.gravity * step; this.y += this.velocity * step;
      if (this.y - flight.radius <= 0 || this.y + flight.radius >= flight.floor) this.dead = true;
      for (const pipe of this.pipes) {
        pipe.x -= flight.speed * step;
        // Circle against the two pipe rectangles, including rounded corner distance.
        const closestX = Math.max(pipe.x, Math.min(flight.birdX, pipe.x + flight.pipeWidth));
        const dx = flight.birdX - closestX;
        const top = pipe.center - flight.gap / 2, bottom = pipe.center + flight.gap / 2;
        const topDistance = Math.max(0, this.y - top), bottomDistance = Math.max(0, bottom - this.y);
        if (dx * dx + Math.min(topDistance * topDistance, bottomDistance * bottomDistance) <= flight.radius * flight.radius) this.dead = true;
        if (!this.dead && !pipe.scored && pipe.x + flight.pipeWidth < flight.birdX - flight.radius) { pipe.scored = true; this.score++; }
      }
      if (this.pipes[0].x + flight.pipeWidth < 0) {
        const old = this.pipes.shift()!;
        old.x = this.pipes[this.pipes.length - 1].x + 260;
        old.center = 200 + this.random() * 260; old.scored = false; this.pipes.push(old);
      }
    }
  }
}
