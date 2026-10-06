import { addDays, daysBetween } from "./dates";
import { displayNameOf, practiceDays } from "./records";
import type { Lesson, PromiseItem, RepertoireItem, Report, Student, StudentChallenge, Thread, Week } from "./types";

export type ReportState = "never" | "stale" | "fresh";

export interface Flag {
  key: string;
  text: string;
  tone: "attention" | "info";
}

export interface BoardRow {
  student: Student;
  name: string;
  reportState: ReportState;
  lastReport: string;
  lastLesson: string;
  latestWeek: Week | undefined;
  flags: Flag[];
}

export interface StudioData {
  students: Student[];
  weeks: Week[];
  lessons: Lesson[];
  reports: Report[];
  promises: PromiseItem[];
  challenges: StudentChallenge[];
  repertoire: RepertoireItem[];
  threads: Thread[];
}

/** A full report is due every quarter. */
export const STALE_AFTER_DAYS = 90;

export function lastReportDate(student: string, data: Pick<StudioData, "reports" | "lessons">): string {
  const posted = data.reports.filter((r) => r.student === student && r.state === "posted").map((r) => r.postedOn || r.draftedOn);
  const viaLessons = data.lessons.filter((l) => l.student === student && l.status === "Report posted").map((l) => l.date);
  return [...posted, ...viaLessons].filter(Boolean).sort().pop() ?? "";
}

export function weeksOf(weeks: Week[], student: string): Week[] {
  return weeks.filter((w) => w.student === student).sort((a, b) => b.date.localeCompare(a.date) || b.edition - a.edition);
}

export function openThreads(threads: Thread[], student?: string): Thread[] {
  return threads.filter((t) => (student === undefined || t.student === student) && !["Resolved", "Dropped"].includes(t.status));
}

export function owedPromises(promises: PromiseItem[], student?: string): PromiseItem[] {
  return promises.filter((p) => (student === undefined || p.student === student) && p.state !== "kept");
}

/** The board: every active student, never reported first, then stale, then fresh, with the brief's flags. */
export function board(data: StudioData, today: string): BoardRow[] {
  const rows = data.students
    .filter((s) => s.status !== "Discontinued")
    .map((s): BoardRow => {
      const lastReport = lastReportDate(s.id, data);
      const reportState: ReportState = !lastReport ? "never" : daysBetween(lastReport, today) > STALE_AFTER_DAYS ? "stale" : "fresh";
      const weeks = weeksOf(data.weeks, s.id);
      const latestWeek = weeks[0];
      const lessons = data.lessons.filter((l) => l.student === s.id).sort((a, b) => b.date.localeCompare(a.date));
      const lastLesson = lessons[0]?.date ?? "";
      const flags: Flag[] = [];
      const add = (key: string, text: string, tone: Flag["tone"] = "attention") => flags.push({ key, text, tone });

      if (s.status === "Pause") add("pause", "On hold: no sheet", "info");
      const now = data.repertoire.some((r) => r.student === s.id && r.role === "NOW" && !r.finishedOn);
      if (!now && !latestWeek?.sheet.song && !s.repertoire) add("nopiece", "No current piece");
      if (weeks.length >= 3 && weeks.slice(0, 3).every((w) => !w.sheet.song.trim())) add("nopiece3", "No piece chosen for three weeks");
      if (s.pointsMode === "plays for points" && !data.challenges.some((c) => c.student === s.id && c.state === "open")) add("nochallenge", "No open challenge");
      const owed = owedPromises(data.promises, s.id);
      if (owed.length) add("promises", owed.length === 1 ? "1 promise owed" : `${owed.length} promises owed`);
      if (s.status === "Active" && (!lastLesson || daysBetween(lastLesson, today) > 8)) add("norecord", lastLesson ? `No lesson record since ${lastLesson}` : "No lesson on record");
      if (latestWeek && latestWeek.status === "draft") add("draft", "Sheet still a draft", "info");
      if (!s.playlist) add("playlist", "No playlist link");
      const days = weeks.slice(0, 4).map((w) => practiceDays(w.ticks)).reverse();
      if (days.length === 4 && days[3] < days[0] && days[3] <= days[2] && days[2] <= days[1]) add("trend", "Practice days trending down");
      const stale = openThreads(data.threads, s.id).filter((t) => !t.lastTouched || t.lastTouched < addDays(today, -21));
      if (stale.length) add("threads", stale.length === 1 ? "A thread untouched for three weeks" : `${stale.length} threads untouched for three weeks`);
      if (openThreads(data.threads, s.id).some((t) => t.status === "Needs a decision")) add("decision", "A thread needs your decision");
      if (latestWeek?.notes.length) add("wrote", "The family wrote to you", "info");
      return { student: s, name: displayNameOf(s), reportState, lastReport, lastLesson, latestWeek, flags };
    });
  const order: Record<ReportState, number> = { never: 0, stale: 1, fresh: 2 };
  return rows.sort((a, b) => order[a.reportState] - order[b.reportState] || a.lastReport.localeCompare(b.lastReport) || a.name.localeCompare(b.name));
}

export interface DueReport {
  student: Student;
  why: string;
  lastReport: string;
}

/** Who is due: every student once a quarter, and a first full report after lesson 3. */
export function reportsDue(data: Pick<StudioData, "students" | "reports" | "lessons">, today: string): DueReport[] {
  return data.students
    .filter((s) => s.status === "Active")
    .map((s): DueReport | null => {
      const last = lastReportDate(s.id, data);
      const lessonCount = data.lessons.filter((l) => l.student === s.id).length;
      const drafted = data.reports.some((r) => r.student === s.id && r.state !== "posted");
      if (drafted) return null;
      if (!last && lessonCount >= 3) return { student: s, why: "First full report, after lesson 3", lastReport: "" };
      if (!last) return { student: s, why: "Never reported", lastReport: "" };
      if (daysBetween(last, today) > STALE_AFTER_DAYS) return { student: s, why: `Last report ${last}`, lastReport: last };
      return null;
    })
    .filter((x): x is DueReport => !!x)
    .sort((a, b) => a.lastReport.localeCompare(b.lastReport));
}
