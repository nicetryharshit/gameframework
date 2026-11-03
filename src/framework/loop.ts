/** requestAnimationFrame loop; dt is seconds and is capped after long stalls. */
export class GameLoop {
  private frame?: number;
  private last?: number;
  private generation = 0;
  constructor(private update: (dt: number) => void, private maxDelta = 0.1) {
    if (!Number.isFinite(maxDelta) || maxDelta <= 0) throw new Error('Invalid maximum delta');
  }
  start(): void {
    if (this.frame !== undefined) return;
    const generation = ++this.generation;
    const tick = (time: number) => {
      if (this.frame === undefined || generation !== this.generation) return;
      const dt = this.last === undefined ? 0 : Math.min((time - this.last) / 1000, this.maxDelta);
      this.last = time;
      try { this.update(dt); } catch (error) { this.stop(); throw error; }
      if (this.frame !== undefined && generation === this.generation) this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }
  stop(): void { if (this.frame !== undefined) cancelAnimationFrame(this.frame); this.frame = undefined; this.last = undefined; }
}
