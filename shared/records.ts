import { carriedTag, noRecordLine } from "./labels";
import { clockLabel, minutesOfTime } from "./dates";
import { CODES, type Card, type Lang, type QR, type RoutineItem, type Sheet, type Student, type StudentChallenge, type Tick, type Week } from "./types";

let seq = 0;
export function localId(prefix = "tmp"): string {
  seq = (seq + 1) % 1_000_000;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}${seq.toString(36)}${rand}`;
}

export function blankCard(): Card {
  return {
    id: localId("c"),
    code: "",
    t: "",
    d: "",
    done: "",
    still: "",
    carriedFrom: "",
    book: "",
    lane: "",
    feeds: "",
    rung: "",
    youPick: false,
    outcome: "",
    outcomeOn: "",
  };
}

export function blankSheet(): Sheet {
  return {
    wins: [],
    song: "",
    songNote: "",
    last: "",
    cards: [blankCard(), blankCard(), blankCard(), blankCard()],
    routine: [],
    keep: { t: "", d: "" },
    challenges: [],
    chalNote: "",
    listen: true,
    quiz: null,
    fig: "",
    figSong: "",
    figLabel: "",
    playlist: "",
    qrSong: null,
    qr2: null,
    qr3: null,
    noqrText: null,
    adultNote: null,
    askFirst: "",
    checkFirst: "",
  };
}

/** Fills any missing fields, so a sheet written by an older version or by hand in Notion still opens. */
export function normalizeSheet(raw: unknown): Sheet {
  const base = blankSheet();
  if (!raw || typeof raw !== "object") return base;
  const s = { ...base, ...(raw as Partial<Sheet>) };
  s.wins = Array.isArray(s.wins) ? s.wins.filter((w) => typeof w === "string") : [];
  s.cards = Array.isArray(s.cards) ? s.cards.map((c) => ({ ...blankCard(), ...c, id: c?.id || localId("c") })) : base.cards;
  s.routine = Array.isArray(s.routine)
    ? s.routine.map((r) => (typeof r === "string" ? parseRoutineLine(r) : { min: Number(r?.min) || 0, text: r?.text ?? "", kind: r?.kind ?? "", card: r?.card ?? "" }))
    : [];
  s.keep = { t: s.keep?.t ?? "", d: s.keep?.d ?? "" };
  s.challenges = Array.isArray(s.challenges) ? s.challenges.filter((c) => typeof c === "string") : [];
  return s;
}

export function blankWeek(student: string, date: string): Week {
  return {
    id: localId(),
    student,
    date,
    status: "draft",
    edition: 1,
    builtFrom: "",
    sheet: blankSheet(),
    ticks: [],
    notes: [],
    listening: [],
    gotIt: {},
    seen: "",
  };
}

/** "10 min the opening line" -> { min: 10, text: "the opening line" } */
export function parseRoutineLine(line: string): RoutineItem {
  const m = /^\s*(\d+)\s*min\.?\s*(.*)$/i.exec(line);
  return m ? { min: Number(m[1]), text: m[2].trim(), kind: "", card: "" } : { min: 0, text: line.trim(), kind: "", card: "" };
}

export function routineLine(r: RoutineItem): string {
  return `${r.min} min ${r.text}`.trim();
}

export function routineTotal(routine: RoutineItem[]): number {
  return routine.reduce((n, r) => n + (Number(r.min) || 0), 0);
}

/**
 * Copies last week's sheet forward, the way the studio run copies records:
 * everything stays, and the lesson rewrites only what changed. Cards not yet
 * met carry their original date; ticks, wins and messages start fresh.
 */
export function copyForward(prev: Week, date: string, opts: { lessonOnRecord: boolean; lastRecord?: string; lang: Lang }): Week {
  const sheet = normalizeSheet(JSON.parse(JSON.stringify(prev.sheet)));
  sheet.cards = sheet.cards.map((c) => ({
    ...c,
    id: localId("c"),
    carriedFrom: c.outcome === "met" ? c.carriedFrom : c.carriedFrom || prev.date,
    outcome: "",
    outcomeOn: "",
  }));
  sheet.wins = [];
  sheet.askFirst = "";
  sheet.checkFirst = "";
  // No record, no new content: the sheet says so in its own language.
  sheet.last = opts.lessonOnRecord ? "" : noRecordLine(opts.lastRecord ?? prev.date, opts.lang);
  const week = blankWeek(prev.student, date);
  week.sheet = sheet;
  week.builtFrom = opts.lessonOnRecord ? "lesson" : "carried";
  return week;
}

/** Cards that were met last week: the editor offers to replace them. */
export function metCards(prev: Week | undefined): Set<string> {
  return new Set((prev?.sheet.cards ?? []).filter((c) => c.outcome === "met").map((c) => c.t));
}

/** Distinct practice days on a sheet: one tick per day, whichever way it arrived. */
export function practiceDays(ticks: Tick[]): number {
  return new Set(ticks.map((t) => t.day)).size;
}

export function toggleTick(ticks: Tick[], card: string, day: number, on: boolean, source: Tick["source"], today: string): Tick[] {
  const rest = ticks.filter((t) => !(t.card === card && t.day === day));
  return on ? [...rest, { card, day, on: today, source }] : rest;
}

// ---------------------------------------------------------------- checks

export interface Problem {
  /** "error" stops the export, as the build script refuses to write. */
  level: "error" | "warn";
  where: string;
  text: string;
}

const DASH = /[\u2012-\u2015]|\s-{1,2}\s|--/;
const EXCLAIM = /[!¡]/;
const EMOJI = /\p{Extended_Pictographic}/u;
const SHOUT = /\b[A-Z]{4,}\b/;

/** The voice rules that hold everywhere a family reads: no dashes, no exclamation marks, no emoji, no all caps. */
export function voiceProblems(text: string, where: string): Problem[] {
  const out: Problem[] = [];
  if (!text) return out;
  if (DASH.test(text)) out.push({ level: "error", where, text: "has a dash" });
  if (EXCLAIM.test(text)) out.push({ level: "error", where, text: "has an exclamation mark" });
  if (EMOJI.test(text)) out.push({ level: "error", where, text: "has an emoji" });
  if (SHOUT.test(text.replace(/\b(?:PDF|BPM|MIDI|ARCT|URL)\b/g, ""))) out.push({ level: "warn", where, text: "has a word in all caps" });
  if (/\bMr\.?\s+Hector\b/i.test(text)) out.push({ level: "error", where, text: "says Mr. Hector" });
  if (/\blevel\s*(up\s*)?\d/i.test(text) || /\b(white|yellow|orange) belt\b/i.test(text)) out.push({ level: "warn", where, text: "mentions a level; no level is printed anywhere" });
  return out;
}

const VALID_TOTALS = [15, 20, 25, 30];

/** The build script's checks, so a sheet that would be refused shows why before export. */
export function sheetProblems(sheet: Sheet, student?: Pick<Student, "pointsMode" | "playlist">): Problem[] {
  const out: Problem[] = [];
  if (sheet.cards.length !== 4) out.push({ level: "error", where: "Cards", text: `has ${sheet.cards.length} cards; a sheet has exactly four` });
  sheet.cards.forEach((c, i) => {
    const where = `Card ${i + 1}`;
    if (!c.t.trim()) out.push({ level: "error", where, text: "needs a title" });
    if (!c.code) out.push({ level: "error", where, text: "needs a code" });
    else if (!(CODES as readonly string[]).includes(c.code)) out.push({ level: "error", where, text: `code ${c.code} is not one of the fifteen` });
    if (!c.done.trim()) out.push({ level: "warn", where, text: "has no Done when yet; it waits for you" });
    if (/\b\d+\s*(min|minutes|times|reps)\b/i.test(c.d)) out.push({ level: "warn", where, text: "detail mentions minutes or counts; those live in the routine" });
    for (const [k, v] of [
      ["title", c.t],
      ["detail", c.d],
      ["Done when", c.done],
      ["Still true when", c.still],
      ["From the shelf", c.book],
    ] as const)
      out.push(...voiceProblems(v, `${where} ${k}`));
  });
  if (sheet.wins.length > 2) out.push({ level: "error", where: "Recent wins", text: "holds more than two lines" });
  sheet.wins.forEach((w, i) => out.push(...voiceProblems(w, `Win ${i + 1}`)));
  const total = routineTotal(sheet.routine);
  if (!sheet.routine.length) out.push({ level: "error", where: "Routine", text: "is empty" });
  else if (!VALID_TOTALS.includes(total)) out.push({ level: "error", where: "Routine", text: `totals ${total} minutes; it should be 15, 20, 25 or 30` });
  sheet.routine.forEach((r, i) => {
    if ((Number(r.min) || 0) < 5) out.push({ level: "error", where: `Routine line ${i + 1}`, text: "is under five minutes" });
    out.push(...voiceProblems(r.text, `Routine line ${i + 1}`));
  });
  for (const [k, v] of [
    ["Song note", sheet.songNote],
    ["Song", sheet.song],
    ["Last time", sheet.last],
    ["Keep it alive", `${sheet.keep.t} ${sheet.keep.d}`],
    ["Challenge note", sheet.chalNote],
  ] as const)
    out.push(...voiceProblems(v, k));
  if (!sheet.song.trim()) out.push({ level: "warn", where: "Song", text: "no current song" });
  if (!sheet.keep.t.trim()) out.push({ level: "warn", where: "Keep it alive", text: "is empty; what the lesson did not touch belongs here" });
  if (sheet.adultNote) {
    const d = Array.isArray(sheet.adultNote.d) ? sheet.adultNote.d.join(" ") : sheet.adultNote.d;
    out.push(...voiceProblems(`${sheet.adultNote.t} ${d}`, "Note to the adult"));
  }
  const plays = !student || student.pointsMode === "plays for points";
  if (plays && sheet.challenges.length && (sheet.challenges.length < 2 || sheet.challenges.length > 4))
    out.push({ level: "warn", where: "Challenges", text: "the block carries two to four open challenges" });
  const playlist = sheet.playlist || student?.playlist || "";
  if (student && !playlist) out.push({ level: "warn", where: "Codes", text: "no playlist link; the sheet prints the ask-me line" });
  else if (playlist && !/list=[\w-]{12,}/.test(playlist)) out.push({ level: "warn", where: "Codes", text: "the playlist link has no list id the generator can print" });
  if (/\bLevel\b/.test(sheet.song)) out.push({ level: "error", where: "Song", text: "has the word Level; the build script refuses it" });
  const all = JSON.stringify(sheet);
  if (/Expressions/.test(all)) out.push({ level: "error", where: "Sheet", text: "names the academy" });
  return out;
}

// ---------------------------------------------------------------- the records JSON (brief 4.5)

/** One entry of `students_<day><date>.json`, exactly as the Python generator reads it. */
export interface RecordJSON {
  name: string;
  slot: string;
  level: "";
  accent: string;
  lang: Lang;
  wins: string[];
  song: string;
  song_note: string;
  last: string;
  cards: { code: string; t: string; d: string; done: string; still: string; book?: string }[];
  routine: string[];
  keep: { t: string; d: string };
  challenges: [string, string, string][];
  chal_note: string;
  playlist: string;
  listen: boolean;
  quiz: unknown;
  fig: string;
  fig_song: string;
  fig_label: string;
  qr_song: QR;
  qr2: QR;
  qr3: QR;
  noqr_text: string | null;
  adult_note: { t: string; d: string | string[] } | null;
}

export function displayNameOf(s: Pick<Student, "displayName" | "name">): string {
  return s.displayName.trim() || s.name.trim().split(/\s+/)[0] || s.name;
}

/** "Monday 4:30, Annandale" from the Notion slot, time and location. */
export function slotLabel(s: Pick<Student, "slots" | "times" | "location">, day?: string): string {
  const slot = (day ? s.slots.find((x) => x.startsWith(day)) : s.slots[0]) ?? s.slots[0] ?? "";
  const dayName = slot.split(/\s+/)[0] ?? "";
  const time = s.times[0] ? clockLabel(s.times[0]) : "";
  const left = [dayName, time].filter(Boolean).join(" ");
  return [left, s.location].filter(Boolean).join(", ");
}

/** Position in the day: Notion "Monday 4" -> 4; falls back to the clock. */
export function slotOrder(s: Pick<Student, "slots" | "times">, day: string): number {
  const slot = s.slots.find((x) => x.replace(/\s+/g, " ").startsWith(day));
  const n = slot ? Number(slot.replace(/\s+/g, " ").split(" ")[1]) : NaN;
  return Number.isFinite(n) ? n * 10_000 + minutesOfTime(s.times[0] ?? "") : 1_000_000 + minutesOfTime(s.times[0] ?? "");
}

export function teachingDays(s: Pick<Student, "slots">): string[] {
  return [...new Set(s.slots.map((x) => x.trim().split(/\s+/)[0]).filter(Boolean))];
}

export function toRecord(student: Student, week: Week, challenges: StudentChallenge[], day?: string): RecordJSON {
  const sheet = normalizeSheet(week.sheet);
  const lang = student.lang;
  const plays = student.pointsMode === "plays for points";
  const byId = new Map(challenges.map((c) => [c.id, c]));
  return {
    name: displayNameOf(student),
    slot: slotLabel(student, day),
    level: "",
    accent: student.accent,
    lang,
    wins: sheet.wins.slice(0, 2),
    song: sheet.song,
    song_note: sheet.songNote,
    last: sheet.last,
    cards: sheet.cards.map((c) => {
      const card: RecordJSON["cards"][number] = {
        code: plays ? c.code : "",
        t: c.t,
        d: c.d,
        done: c.done,
        // The export writes `still` from Still true when, or else from the carry-over date, in the sheet's language.
        still: c.still.trim() || carriedTag(c.carriedFrom, lang),
      };
      if (c.book.trim()) card.book = c.book;
      return card;
    }),
    routine: sheet.routine.map(routineLine),
    keep: { t: sheet.keep.t, d: sheet.keep.d },
    // Opt-outs carry no codes, no points and no challenges block.
    challenges: plays
      ? sheet.challenges
          .map((id) => byId.get(id))
          .filter((c): c is StudentChallenge => !!c)
          .map((c) => [c.name, c.code, c.points == null ? "" : String(c.points)] as [string, string, string])
      : [],
    chal_note: plays ? sheet.chalNote : "",
    playlist: sheet.playlist || student.playlist,
    listen: sheet.listen,
    quiz: sheet.quiz ?? null,
    fig: sheet.fig,
    fig_song: sheet.figSong,
    fig_label: sheet.figLabel,
    qr_song: sheet.qrSong,
    qr2: sheet.qr2,
    qr3: sheet.qr3,
    noqr_text: sheet.noqrText,
    adult_note: sheet.adultNote,
  };
}

/** Reads a records JSON entry back into a sheet (the one-time import of the latest packs). */
export function fromRecord(r: Partial<RecordJSON>): Sheet {
  const sheet = blankSheet();
  sheet.wins = Array.isArray(r.wins) ? r.wins.slice(0, 2) : [];
  sheet.song = r.song ?? "";
  sheet.songNote = r.song_note ?? "";
  sheet.last = r.last ?? "";
  if (Array.isArray(r.cards)) {
    sheet.cards = r.cards.map((c) => {
      const card = blankCard();
      card.code = ((CODES as readonly string[]).includes(c.code) ? c.code : "") as Card["code"];
      card.t = c.t ?? "";
      card.d = c.d ?? "";
      card.done = c.done ?? "";
      const still = c.still ?? "";
      // The old records carry the carry-over tag inside `still`; keep it as text so nothing is lost.
      card.still = still;
      card.book = c.book ?? "";
      return card;
    });
  }
  sheet.routine = Array.isArray(r.routine) ? r.routine.map((x) => parseRoutineLine(String(x))) : [];
  sheet.keep = { t: r.keep?.t ?? "", d: r.keep?.d ?? "" };
  sheet.chalNote = r.chal_note ?? "";
  sheet.playlist = r.playlist ?? "";
  sheet.listen = r.listen ?? true;
  sheet.quiz = r.quiz ?? null;
  sheet.fig = r.fig ?? "";
  sheet.figSong = r.fig_song ?? "";
  sheet.figLabel = r.fig_label ?? "";
  sheet.qrSong = r.qr_song ?? null;
  sheet.qr2 = r.qr2 ?? null;
  sheet.qr3 = r.qr3 ?? null;
  sheet.noqrText = r.noqr_text ?? null;
  sheet.adultNote = r.adult_note ?? null;
  return sheet;
}

/** The pack file name the generator expects: students_<day><ddmon>.json, e.g. students_monday05oct.json. */
export function packFileName(day: string, iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  const mon = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"][m - 1];
  return `students_${day.toLowerCase()}${String(d).padStart(2, "0")}${mon}.json`;
}
