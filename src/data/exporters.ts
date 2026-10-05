import { GAME_BY_ID, stageName, variantName } from "../games/registry";
import type { DB } from "./model";
import { accuracy } from "./stats";

const cell = (v: unknown) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** One row per game played, for spreadsheets. */
export function sessionsCsv(db: DB, studentId?: string): string {
  const names = Object.fromEntries(db.students.map((s) => [s.id, s.name]));
  const header = ["Date", "Time", "Student", "Game", "Stage", "Variant", "Format", "Score", "Correct", "Attempts", "Accuracy %", "Best streak", "Avg seconds", "Minutes", "Where"];
  const rows = db.sessions
    .filter((s) => !studentId || s.studentId === studentId)
    .map((s) => {
      const d = new Date(s.startedAt);
      return [
        d.toLocaleDateString("en-CA"),
        d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
        names[s.studentId] ?? "Unknown",
        GAME_BY_ID[s.game]?.name ?? s.game,
        stageName(s.game, s.stage),
        variantName(s.game, s.variant),
        s.format,
        s.score,
        s.correct,
        s.attempts,
        Math.round(accuracy(s) * 100),
        s.bestStreak,
        s.avgMs ? (s.avgMs / 1000).toFixed(2) : "",
        (s.durationMs / 60000).toFixed(1),
        s.device ?? "",
      ];
    });
  return [header, ...rows].map((r) => r.map(cell).join(",")).join("\n");
}

export function download(filename: string, text: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const today = () => new Date().toLocaleDateString("en-CA");
