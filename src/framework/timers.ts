/**
 * Timers that run on the game's own clock. Call `update(seconds)` with the same time step as the game loop.
 * Clear them when a screen closes, so nothing from the old screen fires on the new one.
 */

/** Stops one timer. Calling it again does nothing. */
export type StopTimer = () => void;

export interface Timers {
  /** Runs `callback` once, after `seconds`. */
  after(seconds: number, callback: () => void): StopTimer;
  /** Runs `callback` every `seconds` until it is stopped or cleared. */
  every(seconds: number, callback: () => void): StopTimer;
  /** Moves every timer forward by `seconds`. */
  update(seconds: number): void;
  /** Stops every timer. */
  clear(): void;
  /** How many timers are running. */
  readonly count: number;
}

interface Entry {
  remaining: number;
  interval: number | undefined;
  callback: () => void;
  active: boolean;
}

export function createTimers(): Timers {
  const entries = new Set<Entry>();
  const checkDelay = (seconds: number) => {
    if (!Number.isFinite(seconds) || seconds <= 0) throw new Error(`Timer delay must be a positive number of seconds, got ${seconds}`);
  };
  const add = (seconds: number, callback: () => void, repeat: boolean): StopTimer => {
    checkDelay(seconds);
    const entry: Entry = { remaining: seconds, interval: repeat ? seconds : undefined, callback, active: true };
    entries.add(entry);
    return () => { entry.active = false; entries.delete(entry); };
  };
  return {
    after: (seconds, callback) => add(seconds, callback, false),
    every: (seconds, callback) => add(seconds, callback, true),
    update(seconds) {
      if (!Number.isFinite(seconds) || seconds < 0) throw new Error(`Timer step must be zero or more seconds, got ${seconds}`);
      // Timers added by a callback start on the next update, so this loop works from a snapshot.
      for (const entry of [...entries]) {
        if (!entry.active) continue;
        entry.remaining -= seconds;
        while (entry.active && entry.remaining <= 0) {
          if (entry.interval === undefined) {
            entry.active = false;
            entries.delete(entry);
            entry.callback();
            break;
          }
          // Keep the leftover time, so a repeating timer does not drift.
          entry.remaining += entry.interval;
          entry.callback();
        }
      }
    },
    clear() {
      for (const entry of entries) entry.active = false;
      entries.clear();
    },
    get count() {
      return entries.size;
    },
  };
}
