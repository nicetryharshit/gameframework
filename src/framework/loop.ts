/** requestAnimationFrame loop; dt is seconds and is capped after long stalls. */
export class GameLoop {
  private frame?: number;
  private last?: number;
  private generation = 0;
  private interval = 0;
  private nextDue?: number;
  setFrameLimit(fps: number): void {
    if (!Number.isFinite(fps) || fps < 0) throw new Error('Invalid frame limit');
    this.interval = fps === 0 ? 0 : 1000 / fps;
    this.nextDue = undefined;
  }
  constructor(private update: (dt: number) => void, private maxDelta = 0.1) {
    if (!Number.isFinite(maxDelta) || maxDelta <= 0) throw new Error('Invalid maximum delta');
  }
  start(): void {
    if (this.frame !== undefined) return;
    const generation = ++this.generation;
    const tick = (time: number) => {
      if (this.frame === undefined || generation !== this.generation) return;
      if (this.nextDue !== undefined && time + 0.01 < this.nextDue) { this.frame = requestAnimationFrame(tick); return; }
      if (this.interval > 0) {
        this.nextDue ??= time;
        this.nextDue += this.interval * Math.max(1, Math.floor((time - this.nextDue) / this.interval) + 1);
      }
      const dt = this.last === undefined ? 0 : Math.min((time - this.last) / 1000, this.maxDelta);
      this.last = time;
      try { this.update(dt); } catch (error) { this.stop(); throw error; }
      if (this.frame !== undefined && generation === this.generation) this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }
  stop(): void { if (this.frame !== undefined) cancelAnimationFrame(this.frame); this.frame = undefined; this.last = undefined; this.nextDue = undefined; }
}
