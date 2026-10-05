import type { Challenge, GameId, ItemStat, Session, Student } from "./model";
import { POINTS_PER_LEVEL } from "./levelup";

const DAY = 86_400_000;

/** Local calendar day, "2026-10-05". */
export function dayKey(d: Date | string): string {
  const x = typeof d === "string" ? new Date(d) : d;
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function accuracy(s: { correct: number; attempts: number }): number {
  return s.attempts ? s.correct / s.attempts : 0;
}

export function sessionsOf(sessions: Session[], studentId: string): Session[] {
  return sessions.filter((s) => s.studentId === studentId);
}

/**
 * Days in a row with at least one session. A streak is still alive today if the
 * last practice day was yesterday, so a student isn't told it broke before bedtime.
 */
export function practiceStreak(sessions: Session[], today = new Date()): { current: number; longest: number; practicedToday: boolean } {
  const days = new Set(sessions.map((s) => dayKey(s.startedAt)));
  const practicedToday = days.has(dayKey(today));
  let current = 0;
  let cursor = practicedToday ? today : addDays(today, -1);
  while (days.has(dayKey(cursor))) {
    current++;
    cursor = addDays(cursor, -1);
  }
  let longest = 0;
  for (const d of days) {
    const start = new Date(`${d}T12:00:00`);
    if (days.has(dayKey(addDays(start, -1)))) continue;
    let run = 0;
    let c = start;
    while (days.has(dayKey(c))) {
      run++;
      c = addDays(c, 1);
    }
    longest = Math.max(longest, run);
  }
  return { current, longest, practicedToday };
}

export function minutesOf(sessions: Session[]): number {
  return sessions.reduce((m, s) => m + s.durationMs, 0) / 60_000;
}

export function inLastDays(sessions: Session[], days: number, now = new Date()): Session[] {
  const since = now.getTime() - days * DAY;
  return sessions.filter((s) => new Date(s.startedAt).getTime() >= since);
}

export function daysSince(iso: string | undefined, now = new Date()): number | null {
  if (!iso) return null;
  return Math.floor((now.getTime() - new Date(iso).getTime()) / DAY);
}

/** Personal best key: same game, stage, variant and format compete with each other. */
export function bestKey(s: Pick<Session, "game" | "stage" | "variant" | "format">): string {
  return `${s.game}:${s.stage}:${s.variant}:${s.format}`;
}

export function personalBest(sessions: Session[], key: string, excludeId?: string): number {
  let best = 0;
  for (const s of sessions) if (s.id !== excludeId && bestKey(s) === key) best = Math.max(best, s.score);
  return best;
}

/** Totals per item (note, interval, key, rung) across sessions. */
export function mastery(sessions: Session[], game?: GameId): Record<string, ItemStat> {
  const out: Record<string, ItemStat> = {};
  for (const s of sessions) {
    if (game && s.game !== game) continue;
    for (const [k, [c, a, ms]] of Object.entries(s.items)) {
      const cur = (out[k] ??= [0, 0, 0]);
      cur[0] += c;
      cur[1] += a;
      cur[2] += ms;
    }
  }
  return out;
}

/** Items a student misses most, worst first. Needs a few attempts before it judges. */
export function weakestItems(stats: Record<string, ItemStat>, count = 3, minAttempts = 3): { item: string; accuracy: number; attempts: number }[] {
  return Object.entries(stats)
    .filter(([, [, a]]) => a >= minAttempts)
    .map(([item, [c, a]]) => ({ item, accuracy: c / a, attempts: a }))
    .filter((x) => x.accuracy < 0.9)
    .sort((x, y) => x.accuracy - y.accuracy || y.attempts - x.attempts)
    .slice(0, count);
}

/** Rhythm rungs a student has cleared, across every session. */
export function clearedRungs(sessions: Session[]): Set<number> {
  const out = new Set<number>();
  for (const s of sessions) if (s.game === "rhythm") s.cleared?.forEach((r) => out.add(r));
  return out;
}

/* --------------------------------- Level Up --------------------------------- */

/** Points earned at the student's current level: notebook carry-in plus challenges completed here. */
export function pointsAtLevel(student: Student, challenges: Challenge[]): number {
  return (
    student.pointsCarried +
    challenges
      .filter((c) => c.studentId === student.id && c.completedAt && c.completedAtLevel === student.levelUp)
      .reduce((p, c) => p + c.points, 0)
  );
}

export function readyToLevelUp(student: Student, challenges: Challenge[]): boolean {
  return pointsAtLevel(student, challenges) >= POINTS_PER_LEVEL;
}

/** Minutes played in the challenge's linked games since it was assigned. */
export function challengeMinutes(challenge: Challenge, sessions: Session[]): number {
  if (!challenge.minutes || !challenge.feeds?.length) return 0;
  const until = challenge.completedAt ?? "9999";
  return minutesOf(
    sessions.filter(
      (s) =>
        s.studentId === challenge.studentId &&
        challenge.feeds!.includes(s.game) &&
        s.startedAt >= challenge.assignedAt &&
        s.startedAt <= until,
    ),
  );
}

/* ------------------------------ teacher signals ------------------------------ */

export type Signal = { kind: "quiet" | "dip" | "best" | "ready" | "minutes"; text: string };

/** Short notes for the roster: who's gone quiet, who slipped, who deserves a shout-out. */
export function studentSignals(student: Student, sessions: Session[], challenges: Challenge[], now = new Date()): Signal[] {
  const mine = sessionsOf(sessions, student.id).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const out: Signal[] = [];
  const last = mine[mine.length - 1];
  const quiet = daysSince(last?.startedAt, now);
  if (mine.length && quiet !== null && quiet >= 7) out.push({ kind: "quiet", text: `No practice in ${quiet} days` });

  if (mine.length >= 6) {
    const acc = (xs: Session[]) => xs.reduce((a, s) => a + accuracy(s), 0) / xs.length;
    const recent = acc(mine.slice(-3));
    const before = acc(mine.slice(-6, -3));
    if (before - recent >= 0.1) out.push({ kind: "dip", text: `Accuracy down ${Math.round((before - recent) * 100)} pts` });
  }

  const week = inLastDays(mine, 7, now);
  for (const s of week) {
    const prior = mine.filter((x) => x.startedAt < s.startedAt && bestKey(x) === bestKey(s));
    if (prior.length && s.score > Math.max(...prior.map((p) => p.score))) {
      out.push({ kind: "best", text: "New personal best this week" });
      break;
    }
  }

  if (student.playsForPoints && readyToLevelUp(student, challenges)) out.push({ kind: "ready", text: "Ready to level up" });

  for (const c of challenges) {
    if (c.studentId !== student.id || c.completedAt || !c.minutes) continue;
    if (challengeMinutes(c, sessions) >= c.minutes) out.push({ kind: "minutes", text: `${c.code} minutes reached` });
  }
  return out;
}
