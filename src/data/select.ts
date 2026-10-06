import { displayNameOf, slotOrder, teachingDays } from "../../shared/records";
import { isoDate, weekdayOf } from "../../shared/dates";
import type { Lesson, Student, Week } from "../../shared/types";
import type { Data } from "./store";

export const nameOf = (s: Student | undefined) => (s ? displayNameOf(s) : "Unknown student");

export function studentById(data: Pick<Data, "students">, id: string): Student | undefined {
  return data.students.find((s) => s.id === id);
}

export function weeksFor(data: Pick<Data, "weeks">, student: string): Week[] {
  return data.weeks.filter((w) => w.student === student).sort((a, b) => b.date.localeCompare(a.date) || b.edition - a.edition);
}

export function lessonsFor(data: Pick<Data, "lessons">, student: string): Lesson[] {
  return data.lessons.filter((l) => l.student === student).sort((a, b) => b.date.localeCompare(a.date) || (b.startedAt || "").localeCompare(a.startedAt || ""));
}

/** The sheet in the student's hands: the newest week dated on or before the given day. */
export function currentWeek(data: Pick<Data, "weeks">, student: string, onOrBefore = isoDate()): Week | undefined {
  return weeksFor(data, student).find((w) => w.date <= onOrBefore) ?? weeksFor(data, student)[weeksFor(data, student).length - 1];
}

/** The day in slot order: everyone whose Notion slot falls on this weekday. */
export function roster(data: Pick<Data, "students">, date: string): Student[] {
  const day = weekdayOf(date);
  return data.students
    .filter((s) => s.status !== "Discontinued" && teachingDays(s).includes(day))
    .sort((a, b) => slotOrder(a, day) - slotOrder(b, day) || nameOf(a).localeCompare(nameOf(b)));
}

export const DAYS = ["Monday", "Thursday", "Saturday"] as const;

/** Every teaching day in use, in week order. */
export function teachingDaysInUse(data: Pick<Data, "students">): string[] {
  const order = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const used = new Set(data.students.flatMap((s) => teachingDays(s)));
  return order.filter((d) => used.has(d));
}

export function activeStudents(data: Pick<Data, "students">): Student[] {
  return data.students.filter((s) => s.status !== "Discontinued").sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
}
