import type { ItemStat } from "./types";

export type Rng = () => number;

export const BASE_POINTS = 10;
/** Every five in a row raises the multiplier, up to ×4. */
export const STREAK_STEP = 5;
export const MAX_MULTIPLIER = 4;

export function multiplier(streakAfterAnswer: number): number {
  return Math.min(MAX_MULTIPLIER, 1 + Math.floor(streakAfterAnswer / STREAK_STEP));
}

/** Up to +10 for answering fast in a sprint: full bonus at 0.8 s, none at 4 s. */
export function speedBonus(ms: number): number {
  if (ms <= 800) return 10;
  if (ms >= 4000) return 0;
  return Math.round((10 * (4000 - ms)) / 3200);
}

/** Rhythm tap modes: up to +10 for landing close to the beat (≤30 ms), none past 150 ms. */
export function timingBonus(meanAbsMs: number): number {
  if (meanAbsMs <= 30) return 10;
  if (meanAbsMs >= 150) return 0;
  return Math.round((10 * (150 - meanAbsMs)) / 120);
}

export function pointsFor(correct: boolean, streakAfterAnswer: number, bonus: number): number {
  return correct ? (BASE_POINTS + bonus) * multiplier(streakAfterAnswer) : 0;
}

/**
 * Picks the next item, leaning toward what the student misses or answers slowly,
 * and toward items they haven't seen. Never repeats the item just asked.
 */
export function pickItem(pool: string[], stats: Record<string, ItemStat>, recent: string[], rng: Rng = Math.random): string {
  if (pool.length === 1) return pool[0];
  const last = recent[recent.length - 1];
  const weights = pool.map((item) => {
    if (item === last) return 0;
    const [c, a, ms] = stats[item] ?? [0, 0, 0];
    const p = (c + 1) / (a + 2);
    const slow = a ? Math.min(1, Math.max(0, (ms / a - 1500) / 3000)) : 0;
    let w = 1 + 3 * (1 - p) + slow + (a === 0 ? 1 : 0);
    if (recent.slice(-3).includes(item)) w *= 0.4;
    return w;
  });
  const total = weights.reduce((x, y) => x + y, 0);
  let r = rng() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0 && weights[i] > 0) return pool[i];
  }
  return pool.find((x) => x !== last) ?? pool[0];
}

export function addStat(stats: Record<string, ItemStat>, item: string, correct: boolean, ms: number): Record<string, ItemStat> {
  const [c, a, t] = stats[item] ?? [0, 0, 0];
  return { ...stats, [item]: [c + (correct ? 1 : 0), a + 1, t + Math.round(ms)] };
}

/** Deterministic RNG for tests and repeatable demos. */
export function seededRng(seed: number): Rng {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 1_000_000) / 1_000_000;
  };
}
