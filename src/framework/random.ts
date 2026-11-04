/**
 * Seeded random numbers. The same seed gives the same sequence every time, so a level, a drop table or a replay
 * can be reproduced from its seed. Use Math.random for things that do not need to repeat.
 */

export interface Random {
  /** A number from 0 up to, but not including, 1. */
  next(): number;
  /** A whole number from `min` to `max`, both included. */
  int(min: number, max: number): number;
  /** A number from `min` up to, but not including, `max`. */
  range(min: number, max: number): number;
  /** One item from the list. The list must not be empty. */
  pick<T>(items: readonly T[]): T;
}

/** Creates a generator from a seed. Uses mulberry32, a small generator that is fast and evenly spread. */
export function createRandom(seed: number): Random {
  if (!Number.isFinite(seed)) throw new Error(`Random seed must be a finite number, got ${seed}`);
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int(min, max) {
      if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) throw new Error(`int needs whole numbers with min <= max, got ${min} and ${max}`);
      return Math.floor(next() * (max - min + 1)) + min;
    },
    range(min, max) {
      if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) throw new Error(`range needs finite numbers with min <= max, got ${min} and ${max}`);
      return min + next() * (max - min);
    },
    pick(items) {
      if (items.length === 0) throw new Error('pick needs at least one item');
      return items[Math.floor(next() * items.length)];
    },
  };
}
