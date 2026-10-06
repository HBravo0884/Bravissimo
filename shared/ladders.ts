import type { Progress, Rung, SkillItem } from "./types";

/** Latest first: by date, then by Notion's edit time. */
function newer(a: Progress, b: Progress): number {
  return (b.date || "").localeCompare(a.date || "") || (b.edited ?? "").localeCompare(a.edited ?? "");
}

export type RungState = "not started" | "current" | "cleared" | "needs recheck";

export interface StudentRung {
  rung: string;
  state: RungState;
  /** Date of the latest fact. */
  on: string;
  mark: Progress["mark"];
  clearedOn: string;
}

/** Each rung's state for one student: the latest dated fact wins, and every earlier one is kept in Notion. */
export function rungStates(progress: Progress[], student: string): Map<string, StudentRung> {
  const mine = progress.filter((p) => p.student === student && p.kind === "rung").sort(newer);
  const out = new Map<string, StudentRung>();
  for (const p of mine) {
    if (out.has(p.rung)) continue;
    const cleared = mine.find((q) => q.rung === p.rung && q.state === "cleared");
    out.set(p.rung, { rung: p.rung, state: (p.state || "current") as RungState, on: p.date, mark: p.mark, clearedOn: cleared?.date ?? "" });
  }
  return out;
}

export function ladderRungs(rungs: Rung[], ladder: string): Rung[] {
  return rungs.filter((r) => r.ladder === ladder).sort((a, b) => a.order - b.order || a.code.localeCompare(b.code));
}

/** Sheets that travel alongside the path (or close the binder) have no place in its order. */
export function onPath(r: Rung): boolean {
  return !["alongside", "worksheet"].includes(r.kind);
}

/** "Before this" and "Next" in print order: the only positions a student ever sees. */
export function neighbours(rungs: Rung[], code: string): { before: Rung | null; next: Rung | null } {
  const r = rungs.find((x) => x.code === code);
  if (!r || !onPath(r)) return { before: null, next: null };
  const list = ladderRungs(rungs, r.ladder).filter(onPath);
  const i = list.findIndex((x) => x.code === code);
  return { before: list[i - 1] ?? null, next: list[i + 1] ?? null };
}

/** Rungs whose prerequisites are all cleared and that are not cleared themselves: where routing can go next. */
export function readyRungs(rungs: Rung[], states: Map<string, StudentRung>, ladder: string): Rung[] {
  return ladderRungs(rungs, ladder).filter((r) => {
    const s = states.get(r.code)?.state;
    if (s === "cleared" || s === "current") return false;
    return r.needs.every((n) => states.get(n)?.state === "cleared");
  });
}

export interface SkillResult {
  item: SkillItem;
  latest: Progress | null;
  /** Passed on its pass mark, and not since marked Practice. */
  passed: boolean;
  /** Missed last time: retest next week with the second prompt set. */
  retest: boolean;
}

export function skillResults(progress: Progress[], skills: SkillItem[], student: string, rung: string): SkillResult[] {
  const mine = progress.filter((p) => p.student === student && p.kind === "skill" && p.rung === rung).sort(newer);
  return skills
    .filter((s) => s.rung === rung)
    .sort((a, b) => Number(a.extra) - Number(b.extra) || a.n - b.n)
    .map((item) => {
      const latest = mine.find((p) => p.item === item.n) ?? null;
      return { item, latest, passed: latest?.state === "Passed", retest: latest?.state === "Practice" };
    });
}

/** Every main box passed: the sheet's Theory challenge is earned (decision 16: 60 points per sheet). */
export function skillsCheckComplete(results: SkillResult[]): boolean {
  const main = results.filter((r) => !r.item.extra);
  return main.length > 0 && main.every((r) => r.passed);
}

/** Every Extra Credit box passed: a second Theory challenge, 40 points. */
export function extraCreditComplete(results: SkillResult[]): boolean {
  const extra = results.filter((r) => r.item.extra);
  return extra.length > 0 && extra.every((r) => r.passed);
}

/** "3" for a main skill, "X2" for an Extra Credit one (stored as 102). */
export function skillLabel(item: SkillItem): string {
  return item.extra ? `X${item.n > 100 ? item.n - 100 : item.n}` : String(item.n);
}

/** Students with a skill to retest, for the retest queue on Today. */
export function retestQueue(progress: Progress[], skills: SkillItem[], student: string): SkillResult[] {
  const rungsTried = [...new Set(progress.filter((p) => p.student === student && p.kind === "skill").map((p) => p.rung))];
  return rungsTried.flatMap((r) => skillResults(progress, skills, student, r).filter((x) => x.retest));
}
