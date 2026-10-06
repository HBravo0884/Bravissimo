import { blankWeek, copyForward, displayNameOf } from "../../shared/records";
import { isoDate, shortDate, timeOfDay } from "../../shared/dates";
import type { Capture, Lesson, Outcome, PromiseItem, Sheet, Student, Week } from "../../shared/types";
import { store } from "./store";
import { studentById, weeksFor } from "./select";

export function weekTitle(student: Student | undefined, date: string): string {
  return `${student ? displayNameOf(student) : "Sheet"}, ${shortDate(date)}`;
}

/**
 * Starts next week's sheet from last week's, the way the studio run copies the
 * records forward. A lesson with no record carries its cards and says so.
 */
export function makeNextWeek(studentId: string, date: string): Week {
  const data = store.data();
  const student = studentById(data, studentId);
  const prev = weeksFor(data, studentId).find((w) => w.date < date) ?? weeksFor(data, studentId)[0];
  let week: Week;
  if (prev) {
    // The new sheet is built from the lesson where last week's went home (or a later one). No record, no new content.
    const mine = data.lessons.filter((l) => l.student === studentId && l.date <= date);
    const lessonOnRecord = mine.some((l) => l.date >= prev.date);
    const lastRecord = mine.map((l) => l.date).sort().pop() ?? "";
    week = copyForward(prev, date, { lessonOnRecord, lastRecord, lang: student?.lang ?? "en" });
  } else {
    week = blankWeek(studentId, date);
    if (student?.playlist) week.sheet.playlist = "";
  }
  const { id: _id, ...rest } = week;
  void _id;
  return store.create("weeks", rest, weekTitle(student, date));
}

export function updateSheet(week: Week, patch: Partial<Sheet>) {
  store.update("weeks", week.id, { sheet: { ...week.sheet, ...patch } });
}

const emptyCapture = (): Capture => ({ wins: [], parentAsks: [], notes: [], outcomes: [], recital: "" });

/** One tap at the start of a lesson: the time is the marker that splits the day's room recording by slot. */
export function startLesson(studentId: string, date = isoDate()): Lesson {
  const data = store.data();
  const existing = data.lessons.find((l) => l.student === studentId && l.date === date);
  const now = new Date().toISOString();
  if (existing) {
    if (!existing.startedAt) store.update("lessons", existing.id, { startedAt: now });
    return { ...existing, startedAt: existing.startedAt || now };
  }
  const student = studentById(data, studentId);
  return store.create("lessons", {
    name: `${student ? displayNameOf(student) : "Lesson"}, ${shortDate(date)}`,
    date,
    student: studentId,
    location: student?.location ?? "",
    status: "",
    whatChanged: "",
    evidence: "",
    assigned: "",
    unresolved: "",
    threads: [],
    transcript: "",
    report: "",
    startedAt: now,
    capture: emptyCapture(),
  });
}

export function updateCapture(lesson: Lesson, patch: Partial<Capture>) {
  store.update("lessons", lesson.id, { capture: { ...emptyCapture(), ...lesson.capture, ...patch } });
}

/** Met, not yet or not tried, set in the lesson by ear: Verified, with the date. */
export function setOutcome(week: Week, cardId: string, outcome: Outcome, lesson?: Lesson) {
  const today = isoDate();
  const cards = week.sheet.cards.map((c) => (c.id === cardId ? { ...c, outcome, outcomeOn: outcome ? today : "" } : c));
  store.update("weeks", week.id, { sheet: { ...week.sheet, cards } });
  if (lesson) {
    const outcomes = [...(lesson.capture?.outcomes ?? []).filter((o) => !(o.week === week.id && o.card === cardId)), ...(outcome ? [{ week: week.id, card: cardId, outcome }] : [])];
    updateCapture(lesson, { outcomes });
  }
}

/** Where it was said: the date and the time on the room recording. */
export function addPromise(studentId: string, what: string, kind: string, lesson?: Lesson): PromiseItem {
  const now = new Date();
  return store.create("promises", {
    what,
    student: studentId,
    kind,
    state: "owed",
    saidOn: lesson?.date ?? isoDate(now),
    recordingTime: timeOfDay(now.toISOString()),
    keptOn: "",
    where: "",
  });
}

export function keepPromise(p: PromiseItem, where = "") {
  store.update("promises", p.id, { state: "kept", keptOn: isoDate(), where: where || p.where });
}
