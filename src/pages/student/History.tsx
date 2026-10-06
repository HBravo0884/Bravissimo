import { useData } from "../../data/store";
import { lessonsFor, weeksFor } from "../../data/select";
import { practiceDays } from "../../../shared/records";
import { longDate } from "../../../shared/dates";
import { href } from "../../router";
import { Empty } from "../../components/ui";
import type { Student } from "../../../shared/types";

/** The time axis: every lesson, sheet, report and practice row, newest first. Nothing is overwritten. */
export function History({ student }: { student: Student }) {
  const lessons = lessonsFor({ lessons: useData("lessons") }, student.id);
  const weeks = weeksFor({ weeks: useData("weeks") }, student.id);
  const reports = useData("reports").filter((r) => r.student === student.id);
  const practice = useData("practice").filter((p) => p.student === student.id);

  return (
    <div className="stack">
      <section className="stack-sm">
        <h2>Lessons</h2>
        {lessons.length === 0 ? (
          <Empty>No lesson records yet. Start one from Today.</Empty>
        ) : (
          <ul className="list card">
            {lessons.map((l) => (
              <li key={l.id}>
                <a className="list-row" href={href(`/lessons/${l.id}`)}>
                  <div className="grow">
                    <div className="row-wrap">
                      <b>{longDate(l.date)}</b>
                      <span className={`pill ${l.status === "Report posted" ? "pill-good" : !l.status ? "pill-warn" : ""}`}>{l.status || "Captured"}</span>
                    </div>
                    <div className="small">{l.whatChanged || <span className="muted">What changed is not written yet.</span>}</div>
                  </div>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="stack-sm">
        <h2>Sheets</h2>
        {weeks.length === 0 ? (
          <Empty>No sheets yet.</Empty>
        ) : (
          <ul className="list card">
            {weeks.map((w) => (
              <li key={w.id}>
                <a className="list-row" href={href(`/s/${student.id}/week/${w.id}`)}>
                  <span className="grow">
                    <b>{longDate(w.date)}</b>
                    {w.edition > 1 ? ` (edition ${w.edition})` : ""} <span className="muted small">{w.sheet.song}</span>
                  </span>
                  <span className="muted small">
                    {practiceDays(w.ticks)} days · {w.status}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
      {reports.length > 0 && (
        <section className="stack-sm">
          <h2>Reports</h2>
          <ul className="list card">
            {reports.map((r) => (
              <li key={r.id} className="list-row static">
                <span className="grow">{r.name || `${r.kind} report`}</span>
                <span className="muted small">{r.state === "posted" ? `posted ${r.postedOn}` : r.state}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {practice.length > 0 && (
        <section className="stack-sm">
          <h2>Practice games</h2>
          <p className="muted small">From the family's device, so Reported until you see it in the lesson.</p>
          <ul className="list card">
            {practice
              .sort((a, b) => b.date.localeCompare(a.date))
              .slice(0, 20)
              .map((p) => (
                <li key={p.id} className="list-row static">
                  <span className="grow">
                    {p.date} {p.game}
                  </span>
                  <span className="muted small">
                    {Math.round(p.minutes)} min · {p.summary.correct} of {p.summary.attempts}
                    {p.summary.fiveInARow.length ? ` · five in a row: ${p.summary.fiveInARow.join(", ")}` : ""}
                  </span>
                </li>
              ))}
          </ul>
        </section>
      )}
    </div>
  );
}
