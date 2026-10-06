/**
 * The rhythm ladder, carried over from the Subdivide prototype.
 *
 * A note: r = rest, v = value (1 whole, 2 half, 4 quarter, 8 eighth, 16 sixteenth),
 * d = dots, t = tuplet (3 = eighth triplet, 5 = sixteenth quintuplet).
 */
export interface RNote {
  r: boolean;
  v: 1 | 2 | 4 | 8 | 16;
  d: 0 | 1;
  t: 3 | 5 | null;
}

export type Bar = RNote[];
export type Rng = () => number;

const n = (v: RNote["v"], d: RNote["d"] = 0, t: RNote["t"] = null): RNote => ({ r: false, v, d, t });
const rest = (v: RNote["v"]): RNote => ({ r: true, v, d: 0, t: null });

export interface RhythmLevel {
  name: string;
  teach: string;
  /** One-beat-or-longer cells a bar is built from. The last one is the level's new figure. */
  cells: Bar[];
  /** The glyph shown in the level list. */
  glyph: RNote;
  whole?: boolean;
}

const Q = [n(4)];
const QR = [rest(4)];
const H = [n(2)];
const DH = [n(2, 1)];
const EE = [n(8), n(8)];
const ER = [n(8), rest(8)];
const RE = [rest(8), n(8)];
const DQE = [n(4, 1), n(8)];
const SSSS = [n(16), n(16), n(16), n(16)];
const DES = [n(8, 1), n(16)];
const SDE = [n(16), n(8, 1)];
const TRIP = [n(8, 0, 3), n(8, 0, 3), n(8, 0, 3)];
const QUIN = [n(16, 0, 5), n(16, 0, 5), n(16, 0, 5), n(16, 0, 5), n(16, 0, 5)];

export const RHYTHM_LEVELS: RhythmLevel[] = [
  { name: "Quarter notes", glyph: n(4), teach: "One note on every beat. Count one, two, three, four out loud while it plays.", cells: [Q, QR] },
  { name: "Half notes", glyph: n(2), teach: "A half note is worth two beats. Hold it while you count the second one.", cells: [Q, QR, H] },
  { name: "Whole notes", glyph: n(1), teach: "A whole note fills the whole bar. Four beats, one sound.", cells: [Q, H, QR], whole: true },
  { name: "Dotted half", glyph: n(2, 1), teach: "The dot adds half again. A half note is two beats, so a dotted half is three.", cells: [Q, QR, H, DH] },
  { name: "Eighth pairs", glyph: n(8), teach: "Two eighths fit inside one beat. Count one and, two and.", cells: [Q, QR, H, EE] },
  { name: "Single eighths", glyph: rest(8), teach: "Now one eighth on its own, with a rest filling the other half of the beat.", cells: [Q, QR, H, EE, ER, RE] },
  { name: "Dotted quarter", glyph: n(4, 1), teach: "A dotted quarter is a beat and a half. It almost always leans into an eighth.", cells: [Q, QR, H, EE, DQE] },
  { name: "Sixteenths", glyph: n(16), teach: "Four sixteenths in one beat. Count one e and a.", cells: [Q, QR, H, EE, SSSS] },
  { name: "Dotted eighth", glyph: n(8, 1), teach: "A long one and a short one inside a single beat. This is the galloping figure.", cells: [Q, QR, EE, SSSS, DES, SDE] },
  { name: "Triplets", glyph: n(8, 0, 3), teach: "Three notes squeezed into one beat instead of two. Say tri-pl-et.", cells: [Q, QR, H, EE, TRIP] },
  { name: "Quintuplets", glyph: n(16, 0, 5), teach: "Five in the space of four. Don't count it, feel it as one gesture.", cells: [Q, QR, EE, TRIP, QUIN] },
  { name: "Everything", glyph: n(16), teach: "All of it, mixed. This is the one to show your teacher.", cells: [Q, QR, H, DH, EE, ER, DQE, SSSS, DES, TRIP] },
];

/** Five correct in a row clears a level, as in Subdivide. */
export const CLEAR_STREAK = 5;

export function beats(note: RNote): number {
  let b = 4 / note.v;
  if (note.d) b *= 1.5;
  if (note.t === 3) b *= 2 / 3;
  if (note.t === 5) b *= 4 / 5;
  return b;
}

const cellBeats = (c: Bar) => c.reduce((s, x) => s + beats(x), 0);
const EPS = 1e-6;

export function makeBar(level: number, rng: Rng = Math.random): Bar {
  const L = RHYTHM_LEVELS[level];
  if (L.whole && rng() < 0.3) return [n(1)];
  const pool = L.cells;
  const newest = pool[pool.length - 1];
  for (let attempt = 0; attempt < 200; attempt++) {
    const bar: Bar = [];
    let left = 4;
    let usedNew = false;
    while (left > 0.001) {
      const choices = pool.filter((c) => cellBeats(c) <= left + EPS);
      if (!choices.length) break;
      let c: Bar;
      if (!usedNew && cellBeats(newest) <= left + EPS && rng() < 0.55) c = newest;
      else c = choices[Math.floor(rng() * choices.length)];
      if (c === newest) usedNew = true;
      c.forEach((x) => bar.push({ ...x }));
      left -= cellBeats(c);
    }
    const sounded = bar.filter((x) => !x.r).length;
    if (Math.abs(left) < 0.001 && usedNew && sounded >= 2 && bar.length <= 12) return bar;
  }
  return [n(4), n(4), n(4), n(4)];
}

/** Attack times in beats from the start of the bar. */
export function onsets(bar: Bar): number[] {
  let t = 0;
  const out: number[] = [];
  for (const x of bar) {
    if (!x.r) out.push(t);
    t += beats(x);
  }
  return out;
}

/** Two bars sound the same when their attacks land at the same times. */
export function sameSound(a: Bar, b: Bar): boolean {
  const oa = onsets(a);
  const ob = onsets(b);
  return oa.length === ob.length && oa.every((v, i) => Math.abs(v - ob[i]) < 0.001);
}

/** A different-sounding bar from the same level, for multiple choice. */
export function distractor(level: number, bar: Bar, avoid: Bar[] = [], rng: Rng = Math.random): Bar {
  for (let i = 0; i < 300; i++) {
    const c = makeBar(level, rng);
    if (sameSound(c, bar) || avoid.some((a) => sameSound(c, a))) continue;
    return c;
  }
  return makeBar(level, rng);
}

export interface TapGrade {
  ok: boolean;
  hits: number;
  wanted: number;
  extra: number;
  /** Mean signed timing error in ms (positive = late). */
  meanErrorMs: number;
  /** Mean absolute timing error in ms. */
  meanAbsErrorMs: number;
}

/**
 * Grades taps against the bar. Each note must be matched by a tap within
 * ±min(180 ms, 30% of a beat), with no extra taps — Subdivide's rule.
 */
export function gradeTaps(bar: Bar, taps: number[], startAt: number, bpm: number): TapGrade {
  const spb = 60 / bpm;
  const want = onsets(bar).map((b) => startAt + b * spb);
  const tol = Math.min(0.18, spb * 0.3);
  const used = new Array(taps.length).fill(false);
  const errs: number[] = [];
  for (const w of want) {
    let bi = -1;
    let bd = Infinity;
    taps.forEach((t, i) => {
      if (used[i]) return;
      const d = Math.abs(t - w);
      if (d < bd) {
        bd = d;
        bi = i;
      }
    });
    if (bi >= 0 && bd <= tol) {
      used[bi] = true;
      errs.push((taps[bi] - w) * 1000);
    }
  }
  const extra = used.filter((u) => !u).length;
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  return {
    ok: errs.length === want.length && extra === 0,
    hits: errs.length,
    wanted: want.length,
    extra,
    meanErrorMs: Math.round(mean(errs)),
    meanAbsErrorMs: Math.round(mean(errs.map(Math.abs))),
  };
}
