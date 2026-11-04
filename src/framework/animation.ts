/**
 * Plays a list of frames in order at a set speed, for example a walking character. The frames can be anything:
 * image sources from the asset loader, texture names, or plain numbers for a custom renderer.
 */

export interface FrameAnimation<T> {
  /** The frame to show now. */
  readonly frame: T;
  /** True once a one-time animation has shown its last frame for its full duration. Always false when looping. */
  readonly done: boolean;
  /** Moves the animation forward by `seconds`. */
  update(seconds: number): void;
  /** Starts again from the first frame. */
  reset(): void;
}

export interface FrameAnimationOptions {
  /** Frames per second. */
  fps: number;
  /** Repeat forever. Defaults to true. */
  loop?: boolean;
}

export function createFrameAnimation<T>(frames: readonly T[], options: FrameAnimationOptions): FrameAnimation<T> {
  if (frames.length === 0) throw new Error('An animation needs at least one frame');
  if (!Number.isFinite(options.fps) || options.fps <= 0) throw new Error(`Animation fps must be a positive number, got ${options.fps}`);
  const { fps } = options;
  const loop = options.loop ?? true;
  let elapsed = 0;
  // Position in frames, counted from the start. The frame shown depends only on elapsed time, so a long stall
  // does not make the animation run slow or skip frames for longer than the stall.
  const steps = () => Math.floor(elapsed * fps);
  return {
    get frame() {
      const step = steps();
      return frames[loop ? step % frames.length : Math.min(step, frames.length - 1)];
    },
    get done() {
      return !loop && steps() >= frames.length;
    },
    update(seconds) {
      if (!Number.isFinite(seconds) || seconds < 0) throw new Error(`Animation step must be zero or more seconds, got ${seconds}`);
      elapsed += seconds;
    },
    reset() {
      elapsed = 0;
    },
  };
}
