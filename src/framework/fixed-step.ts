/**
 * Runs an update in fixed steps (for example 1/60 s) while the frame time varies.
 * Leftover time carries into the next frame. `alpha` says how far the next step has progressed, for drawing between steps.
 * Physics engines and deterministic gameplay need this; the variable dt from GameLoop does not give it.
 */
export class FixedStep {
  private accumulator = 0;

  constructor(readonly step = 1 / 60, readonly maxSteps = 5) {
    if (!Number.isFinite(step) || step <= 0) throw new Error('Invalid step');
    if (!Number.isInteger(maxSteps) || maxSteps < 1) throw new Error('Invalid maximum steps');
  }

  /**
   * Adds dt seconds and calls update(step) once per whole step, up to maxSteps. Returns how many steps ran.
   * If the cap is reached, the rest of the backlog is dropped, so a long stall does not replay for seconds.
   * Non-finite or non-positive dt does nothing.
   */
  advance(dt: number, update: (step: number) => void): number {
    if (!Number.isFinite(dt) || dt <= 0) return 0;
    this.accumulator += dt;
    let steps = 0;
    // The small tolerance stops float rounding from losing a step, e.g. three frames of 1/60 s.
    while (this.accumulator + 1e-9 >= this.step && steps < this.maxSteps) {
      update(this.step);
      this.accumulator = Math.max(0, this.accumulator - this.step);
      steps++;
    }
    if (steps === this.maxSteps && this.accumulator + 1e-9 >= this.step) this.accumulator = 0;
    return steps;
  }

  /** Fraction of the next step already elapsed, from 0 up to just under 1. Use it to interpolate drawing. */
  get alpha(): number {
    return Math.min(1, Math.max(0, this.accumulator / this.step));
  }

  /** Drops any leftover time, for example when a level starts or the game resumes. */
  reset(): void {
    this.accumulator = 0;
  }
}
