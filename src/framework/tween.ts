/**
 * Moves numbers on an object from where they are to target values over time, with an easing curve. Use it for
 * a menu sliding in, a title fading out, or a bounce. Call `update(seconds)` each frame.
 */

/** Maps progress from 0 to 1 onto a curve. Every easing returns 0 at the start and 1 at the end. */
export type Easing = (t: number) => number;

export const easing = {
  linear: (t: number): number => t,
  easeIn: (t: number): number => t * t,
  easeOut: (t: number): number => 1 - (1 - t) * (1 - t),
  easeInOut: (t: number): number => (t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2),
  /** Goes a little past the target, then settles back. */
  easeOutBack: (t: number): number => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
  },
  /** Bounces at the end, like a dropped ball. */
  easeOutBounce: (t: number): number => {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) { const s = t - 1.5 / d1; return n1 * s * s + 0.75; }
    if (t < 2.5 / d1) { const s = t - 2.25 / d1; return n1 * s * s + 0.9375; }
    const s = t - 2.625 / d1;
    return n1 * s * s + 0.984375;
  },
};

export interface Tween {
  /** True once the tween has reached its targets, or was cancelled. */
  readonly done: boolean;
  /** Moves the tween forward by `seconds`. */
  update(seconds: number): void;
  /** Stops where the values are now. `onDone` is not called. */
  cancel(): void;
}

export interface TweenOptions {
  easing?: Easing;
  onDone?: () => void;
}

/**
 * Tweens the numeric properties of `target` to `values` over `seconds`. Each property starts from its value when
 * the tween is created. Several tweens can run on the same object, but they will fight over the same property.
 */
export function tween<T extends Record<string, number>>(target: T, values: { [K in keyof T]?: number }, seconds: number, options: TweenOptions = {}): Tween {
  if (!Number.isFinite(seconds) || seconds < 0) throw new Error(`Tween time must be zero or more seconds, got ${seconds}`);
  const ease = options.easing ?? easing.easeInOut;
  const store = target as Record<string, number>;
  const moves = (Object.keys(values) as (keyof T & string)[])
    .filter(key => values[key] !== undefined)
    .map(key => ({ key, start: store[key], end: values[key] as number }));
  let elapsed = 0;
  let done = false;
  return {
    get done() {
      return done;
    },
    update(dt) {
      if (done) return;
      if (!Number.isFinite(dt) || dt < 0) throw new Error(`Tween step must be zero or more seconds, got ${dt}`);
      elapsed += dt;
      const progress = seconds === 0 ? 1 : Math.min(elapsed / seconds, 1);
      const eased = ease(progress);
      for (const { key, start, end } of moves) store[key] = start + (end - start) * eased;
      if (progress >= 1) {
        done = true;
        options.onDone?.();
      }
    },
    cancel() {
      done = true;
    },
  };
}
