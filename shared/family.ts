import { carriedTag, labels } from "./labels";
import { neighbours, rungStates } from "./ladders";
import { displayNameOf, normalizeSheet } from "./records";
import type { FamilyView, Lang, Progress, QR, Resource, Rung, Student, StudentChallenge, Week } from "./types";

/** Weeks a family may see: only sheets the teacher has read. */
export function familyVisible(w: Week): boolean {
  return w.status !== "draft";
}

export function latestFamilyWeek(weeks: Week[], student: string): Week | undefined {
  return weeks
    .filter((w) => w.student === student && familyVisible(w))
    .sort((a, b) => b.date.localeCompare(a.date) || b.edition - a.edition)[0];
}

function codeLink(qr: QR, fallbackLabel: string, resources: Resource[]): { label: string; url: string } | null {
  if (!qr) return null;
  if (typeof qr === "string") return qr ? { label: fallbackLabel, url: qr } : null;
  if ("id" in qr) {
    const r = resources.find((x) => x.key === qr.id);
    return r && !r.teacherOnly && r.url ? { label: r.label || r.key, url: r.url } : null;
  }
  return qr.url ? { label: qr.label || fallbackLabel, url: qr.url } : null;
}

/**
 * The family page: one student's family-visible week and nothing else. Never a
 * level, a rank, another student, a points quantity, a flag, FERN or a thread.
 */
export function familyView(input: {
  student: Student;
  week: Week | undefined;
  challenges: StudentChallenge[];
  progress: Progress[];
  rungs: Rung[];
  resources: Resource[];
}): FamilyView {
  const { student, week, challenges, progress, rungs, resources } = input;
  const lang: Lang = student.lang;
  const L = labels(lang);
  const plays = student.pointsMode === "plays for points";
  const base: FamilyView = {
    displayName: displayNameOf(student),
    lang,
    accent: student.accent,
    week: "",
    date: "",
    wins: [],
    song: "",
    songNote: "",
    last: "",
    cards: [],
    routine: [],
    keep: { t: "", d: "" },
    challenges: [],
    codes: [],
    adultNote: null,
    ticks: [],
    notes: [],
    listening: [],
    rungs: [],
    empty: true,
  };

  const states = rungStates(progress, student.id);
  base.rungs = [...states.values()]
    .filter((s) => s.state === "current")
    .map((s) => {
      const r = rungs.find((x) => x.code === s.rung);
      if (!r) return null;
      const { before, next } = neighbours(rungs, r.code);
      const title = (x: Rung | null) => (x ? (lang === "es" && x.titleEs ? x.titleEs : x.title) : "");
      return {
        ladder: r.ladder,
        title: title(r),
        doneWhen: lang === "es" && r.doneWhenEs ? r.doneWhenEs : r.doneWhen,
        before: title(before),
        next: title(next),
      };
    })
    .filter((x): x is FamilyView["rungs"][number] => !!x);

  if (!week || !familyVisible(week)) return base;
  const sheet = normalizeSheet(week.sheet);
  const byId = new Map(challenges.map((c) => [c.id, c]));
  const codes = [
    codeLink(sheet.playlist || student.playlist, L.playlist, resources),
    codeLink(sheet.qrSong, L.music, resources),
    codeLink(sheet.qr2, L.codes, resources),
    codeLink(sheet.qr3, L.codes, resources),
  ].filter((c): c is { label: string; url: string } => !!c);

  return {
    ...base,
    week: week.id,
    date: week.date,
    wins: sheet.wins.slice(0, 2),
    song: sheet.song,
    songNote: sheet.songNote,
    last: sheet.last,
    cards: sheet.cards.map((c) => ({
      id: c.id,
      code: plays ? c.code : "",
      t: c.t,
      d: c.d,
      done: c.done,
      still: c.still,
      carried: carriedTag(c.carriedFrom, lang),
      book: c.book,
      youPick: c.youPick,
      gotIt: week.gotIt?.[c.id] ?? "",
    })),
    routine: sheet.routine.map((r) => ({ min: r.min, text: r.text })),
    keep: sheet.keep,
    challenges: plays
      ? sheet.challenges
          .map((id) => byId.get(id))
          .filter((c): c is StudentChallenge => !!c && c.state === "open")
          // Category only: the digit is the level, and no level is printed anywhere.
          .map((c) => ({ name: c.name, code: c.code.trim().split(/\s+/)[0].replace(/\d.*$/, ""), blocks: Math.max(0, Math.min(10, c.blocks)) }))
      : [],
    codes,
    adultNote: sheet.adultNote,
    ticks: week.ticks.map((t) => ({ card: t.card, day: t.day })),
    notes: week.notes,
    listening: week.listening,
    empty: false,
  };
}
