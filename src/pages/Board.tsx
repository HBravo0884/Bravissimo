import { useMemo } from "react";
import { useData } from "../data/store";
import { board, type ReportState } from "../../shared/board";
import { isoDate } from "../../shared/dates";
import { practiceDays } from "../../shared/records";
import { href } from "../router";
import { Chip, Empty } from "../components/ui";

const HEAD: Record<ReportState, string> = { never: "Never reported", stale: "Stale: last report over three months ago", fresh: "Fresh" };

/** Who needs attention this week: never reported first, then stale, then fresh, with the flags. */
export function Board() {
  const students = useData("students");
  const weeks = useData("weeks");
  const lessons = useData("lessons");
  const reports = useData("reports");
  const promises = useData("promises");
  const challenges = useData("challenges");
  const repertoire = useData("repertoire");
  const threads = useData("threads");
  const today = isoDate();
  const rows = useMemo(
    () => board({ students, weeks, lessons, reports, promises, challenges, repertoire, threads }, today),
    [students, weeks, lessons, reports, promises, challenges, repertoire, threads, today],
  );
  if (!rows.length) return <Empty>No students yet.</Empty>;
  const groups: ReportState[] = ["never", "stale", "fresh"];
  const attention = rows.filter((r) => r.flags.some((f) => f.tone === "attention")).length;
  return (
    <div className="stack">
      <header className="page-head">
        <span className="eyebrow">The board</span>
        <h1>
          {attention} of {rows.length} need attention
        </h1>
        <p className="muted">Built from the record each time you open it, so it is never a week behind.</p>
      </header>
      {groups.map((g) => {
        const list = rows.filter((r) => r.reportState === g);
        if (!list.length) return null;
        return (
          <section key={g} className="stack-sm">
            <h2>
              {HEAD[g]} <span className="muted">({list.length})</span>
            </h2>
            <ul className="board-grid plain">
              {list.map((r) => (
                <li key={r.student.id}>
                  <a className="board-card card" href={href(`/s/${r.student.id}`)} style={{ borderTopColor: r.student.accent || undefined }}>
                    <div className="row">
                      <Chip name={r.name} accent={r.student.accent} size={34} />
                      <div className="grow">
                        <b>{r.name}</b>
                        <div className="tiny muted">
                          {r.lastReport ? `Report ${r.lastReport}` : "No report yet"}
                          {r.latestWeek ? ` · ${practiceDays(r.latestWeek.ticks)} practice days` : ""}
                        </div>
                      </div>
                    </div>
                    {r.flags.length > 0 && (
                      <div className="row-wrap">
                        {r.flags.map((f) => (
                          <span key={f.key} className={`pill ${f.tone === "attention" ? "pill-warn" : ""}`}>
                            {f.text}
                          </span>
                        ))}
                      </div>
                    )}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
