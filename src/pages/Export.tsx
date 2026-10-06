import { useMemo, useState } from "react";
import { useData } from "../data/store";
import { nameOf, roster, teachingDaysInUse, weeksFor } from "../data/select";
import { packFileName, sheetProblems, toRecord } from "../../shared/records";
import { isoDate, longDate, nextWeekday } from "../../shared/dates";
import { href, navigate } from "../router";
import { CopyButton, Empty, Icon, Segmented, download } from "../components/ui";

/**
 * The records JSON the Python generator prints from: one list per teaching day,
 * in slot order, with the build script's checks run first.
 */
export function ExportPage({ day, date }: { day?: string; date?: string }) {
  const students = useData("students");
  const weeks = useData("weeks");
  const challenges = useData("challenges");
  const days = teachingDaysInUse({ students });
  const theDay = day && days.includes(day) ? day : days[0] ?? "Monday";
  const [d, setD] = useState(date ?? nextWeekday(theDay, isoDate()));

  const rows = useMemo(
    () =>
      roster({ students }, d)
        .filter((s) => s.status === "Active")
        .map((s) => {
          const week = weeksFor({ weeks }, s.id).find((w) => w.date === d);
          return { student: s, week, problems: week ? sheetProblems(week.sheet, s) : [] };
        }),
    [students, weeks, d],
  );
  const ready = rows.filter((r) => r.week);
  const errors = ready.reduce((n, r) => n + r.problems.filter((p) => p.level === "error").length, 0);
  const records = ready.map((r) => toRecord(r.student, r.week!, challenges, theDay));
  const json = JSON.stringify(records, null, 2);

  return (
    <div className="stack">
      <header className="page-head">
        <span className="eyebrow">Records file</span>
        <h1>{packFileName(theDay, d)}</h1>
        <p className="muted">The exact list the weekly sheet generator reads. No level is ever filled; students who do not play for points get no codes and no challenges.</p>
      </header>
      <div className="row-wrap">
        <Segmented label="Teaching day" value={theDay} options={days.map((x) => ({ id: x, label: x }))} onChange={(x) => {
          const nd = nextWeekday(x, isoDate());
          setD(nd);
          navigate(`/export/${x}/${nd}`, true);
        }} />
        <label className="field">
          <span>Sheet date</span>
          <input className="input" type="date" value={d} onChange={(e) => setD(e.target.value)} />
        </label>
      </div>
      {rows.length === 0 ? (
        <Empty>No students on {theDay}.</Empty>
      ) : (
        <ul className="list card">
          {rows.map(({ student, week, problems }) => {
            const errs = problems.filter((p) => p.level === "error");
            return (
              <li key={student.id}>
                <a className="list-row" href={week ? href(`/s/${student.id}/week/${week.id}`) : href(`/s/${student.id}`)}>
                  <div className="grow">
                    <b>{nameOf(student)}</b>
                    <div className="small muted">
                      {week ? `${week.sheet.song || "No song"} · ${week.status}` : `No sheet for ${longDate(d)} yet`}
                    </div>
                    {errs.length > 0 && (
                      <div className="small bad-text">
                        {errs.slice(0, 2).map((p) => `${p.where} ${p.text}`).join("; ")}
                        {errs.length > 2 ? `; ${errs.length - 2} more` : ""}
                      </div>
                    )}
                  </div>
                  {week ? (
                    errs.length ? (
                      <span className="pill pill-bad">{errs.length}</span>
                    ) : week.status === "draft" ? (
                      <span className="pill pill-warn">draft</span>
                    ) : (
                      <Icon name="check" size={20} />
                    )
                  ) : (
                    <span className="pill">missing</span>
                  )}
                </a>
              </li>
            );
          })}
        </ul>
      )}
      <section className="card pad stack-sm">
        <p>
          {ready.length} of {rows.length} sheets ready{errors ? `, with ${errors} problems the build script would refuse` : ""}.
        </p>
        <div className="btn-row">
          <button className="btn btn-primary" type="button" disabled={!ready.length || errors > 0} onClick={() => download(packFileName(theDay, d), json)}>
            <Icon name="download" size={18} /> Download {packFileName(theDay, d)}
          </button>
          <CopyButton text={json} label="Copy the JSON" />
        </div>
        {errors > 0 && <p className="small muted">Fix the problems first; the generator refuses the same things.</p>}
      </section>
    </div>
  );
}
