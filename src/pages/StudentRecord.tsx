import { useState } from "react";
import { store, useData, useSync } from "../data/store";
import { lessonsFor, nameOf, studentById, weeksFor } from "../data/select";
import { makeNextWeek } from "../data/actions";
import { practiceDays, slotLabel, teachingDays } from "../../shared/records";
import { addDays, isoDate, longDate, nextWeekday } from "../../shared/dates";
import { openThreads, owedPromises } from "../../shared/board";
import { href, navigate } from "../router";
import { Chip, CopyButton, DayBoxes, Empty, Icon, Tabs } from "../components/ui";
import { Profile } from "./student/Profile";
import { Ladders } from "./student/Ladders";
import { Challenges } from "./student/Challenges";
import { Repertoire } from "./student/Repertoire";
import { History } from "./student/History";
import type { Student, Week } from "../../shared/types";

type Tab = "week" | "ladders" | "challenges" | "repertoire" | "history" | "profile";

export function StudentRecord({ studentId, tab }: { studentId: string; tab?: string }) {
  const students = useData("students");
  const student = studentById({ students }, studentId);
  const current: Tab = (["week", "ladders", "challenges", "repertoire", "history", "profile"] as Tab[]).includes(tab as Tab) ? (tab as Tab) : "week";

  if (!student) return <Empty>That student is not in the record on this device yet.</Empty>;

  return (
    <div className="stack">
      <header className="page-head row">
        <a className="btn btn-ghost btn-sm" href={href("/students")} aria-label="All students">
          <Icon name="back" />
        </a>
        <Chip name={nameOf(student)} accent={student.accent} size={48} />
        <div className="grow">
          <h1>{nameOf(student)}</h1>
          <p className="muted small">
            {[slotLabel(student), student.status !== "Active" ? student.status : "", student.fern ? `Focus: ${student.fern}` : ""].filter(Boolean).join(" · ") || "No slot yet"}
          </p>
        </div>
      </header>
      <Tabs
        label="Student record"
        value={current}
        onChange={(t) => navigate(`/s/${student.id}/${t}`, true)}
        tabs={[
          { id: "week", label: "Week" },
          { id: "ladders", label: "Ladders" },
          { id: "challenges", label: "Challenges" },
          { id: "repertoire", label: "Repertoire" },
          { id: "history", label: "Lessons" },
          { id: "profile", label: "Profile" },
        ]}
      />
      {current === "week" && <WeekTab student={student} />}
      {current === "ladders" && <Ladders student={student} />}
      {current === "challenges" && <Challenges student={student} />}
      {current === "repertoire" && <Repertoire student={student} />}
      {current === "history" && <History student={student} />}
      {current === "profile" && <Profile student={student} />}
    </div>
  );
}

function nextLessonDate(s: Student): string {
  const days = teachingDays(s);
  const tomorrow = addDays(isoDate(), 1);
  return days.map((d) => nextWeekday(d, tomorrow)).sort()[0] ?? addDays(isoDate(), 7);
}

function WeekTab({ student }: { student: Student }) {
  const weeks = useData("weeks");
  const lessons = useData("lessons");
  const promises = useData("promises");
  const threads = useData("threads");
  const sync = useSync();
  const mine = weeksFor({ weeks }, student.id);
  const [pick, setPick] = useState(mine[0]?.id ?? "");
  const week = mine.find((w) => w.id === pick) ?? mine[0];
  const [date, setDate] = useState(() => nextLessonDate(student));
  const lastLesson = lessonsFor({ lessons }, student.id)[0];

  return (
    <div className="stack">

      {!week ? (
        <Empty>No sheets yet. Start one above, or import the latest records file in Settings.</Empty>
      ) : (
        <>
          {mine.length > 1 && (
            <div className="row-wrap" role="group" aria-label="Sheets">
              {mine.slice(0, 8).map((w) => (
                <button key={w.id} type="button" className={`pill-button ${w.id === week.id ? "on" : ""}`} onClick={() => setPick(w.id)}>
                  {w.date.slice(5)}
                  {w.edition > 1 ? ` (${w.edition})` : ""}
                </button>
              ))}
            </div>
          )}
          <SheetSummary student={student} week={week} />
        </>
      )}

      <section className="card pad stack-sm">
        <div className="spread">
          <h2>Start a sheet</h2>
        </div>
        <p className="muted small">Copies the newest sheet forward: unfinished cards carry with their date, ticks and wins start fresh. A lesson with no record says so on the sheet.</p>
        <div className="row-wrap">
          <label className="field">
            <span>Sheet date</span>
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <button
            className="btn btn-primary"
            type="button"
            disabled={!date}
            onClick={() => {
              const existing = mine.find((w) => w.date === date);
              if (existing && !window.confirm(`There is already a sheet for ${longDate(date)}. Start a second edition?`)) return;
              const w = makeNextWeek(student.id, date);
              if (existing) store.update("weeks", w.id, { edition: existing.edition + 1 });
              navigate(`/s/${student.id}/week/${w.id}`);
            }}
          >
            <Icon name="plus" size={18} /> Start the sheet
          </button>
        </div>
        {lastLesson && <p className="small">Last lesson on record: {longDate(lastLesson.date)}{lastLesson.whatChanged ? `. ${lastLesson.whatChanged}` : ""}</p>}
      </section>

      <section className="two">
        <div className="card pad stack-sm">
          <h3>Promises owed</h3>
          {owedPromises(promises, student.id).length ? (
            <ul className="plain small">
              {owedPromises(promises, student.id).map((p) => (
                <li key={p.id}>
                  {p.what} <span className="muted">({p.state}, said {p.saidOn})</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small">None.</p>
          )}
          <a className="small" href={href("/promises")}>
            All promises
          </a>
        </div>
        <div className="card pad stack-sm">
          <h3>Open threads</h3>
          {openThreads(threads, student.id).length ? (
            <ul className="plain small">
              {openThreads(threads, student.id).map((t) => (
                <li key={t.id}>
                  <b>{t.name}</b> <span className="muted">({t.status})</span>
                  {t.nextMove && <div>Next move: {t.nextMove}</div>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small">None.</p>
          )}
          <a className="small" href={href("/threads")}>
            All threads
          </a>
        </div>
      </section>
      {sync.mode === "notion" && <p className="muted tiny">Sheets live in the Weeks database on the Bravissimo page of the Student tracker.</p>}
    </div>
  );
}

const STATUS_HELP: Record<Week["status"], string> = {
  draft: "Not yet checked. The family page does not show it.",
  verified: "Checked. The family page shows it.",
  printed: "Printed. The family page shows it.",
  "handed out": "Handed out in the lesson.",
};

function SheetSummary({ student, week }: { student: Student; week: Week }) {
  const sheet = week.sheet;
  const ticksByCard = new Map<string, Set<number>>();
  for (const t of week.ticks) {
    if (!ticksByCard.has(t.card)) ticksByCard.set(t.card, new Set());
    ticksByCard.get(t.card)!.add(t.day);
  }
  return (
    <section className="card pad stack">
      <div className="spread">
        <div>
          <span className="eyebrow">Sheet for {longDate(week.date, "en")}</span>
          <h2>{sheet.song || "No song yet"}</h2>
        </div>
        <div className="row-wrap">
          <span className={`pill ${week.status === "draft" ? "pill-warn" : "pill-good"}`}>{week.status}</span>
          <a className="btn btn-primary btn-sm" href={href(`/s/${student.id}/week/${week.id}`)}>
            <Icon name="edit" size={18} /> Edit
          </a>
        </div>
      </div>
      <p className="muted small">{STATUS_HELP[week.status]}</p>
      {sheet.wins.length > 0 && (
        <div>
          <span className="label">Recent wins</span>
          <ul className="plain">
            {sheet.wins.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="card-grid">
        {sheet.cards.map((c) => (
          <article key={c.id} className="mini-card" style={{ borderColor: student.accent || undefined }}>
            <div className="row-wrap">
              {c.code && <span className="code-chip" style={{ background: student.accent || undefined }}>{c.code}</span>}
              <b>{c.t || "Untitled card"}</b>
            </div>
            {c.done && (
              <p className="small">
                <b>Done when</b> {c.done}
              </p>
            )}
            {c.carriedFrom && <p className="tiny muted">Carried over from {c.carriedFrom}</p>}
            {c.outcome && <span className={`pill ${c.outcome === "met" ? "pill-good" : ""}`}>{c.outcome}</span>}
            {week.gotIt[c.id] && <span className="pill pill-peach">Family says got it, {week.gotIt[c.id]} (Reported)</span>}
            <DayBoxes
              label={`Practice days for ${c.t}`}
              accent={student.accent}
              ticked={ticksByCard.get(c.id) ?? new Set()}
              onToggle={(day, on) => store.tick(week.id, c.id, day, on, "paper")}
            />
          </article>
        ))}
      </div>
      <p className="small">
        <b>{practiceDays(week.ticks)}</b> {practiceDays(week.ticks) === 1 ? "practice day" : "practice days"} on this sheet. Tap boxes to type in the paper count; ticks from the family page arrive on their own.
      </p>
      {week.notes.length > 0 && (
        <div className="stack-sm">
          <span className="label">Write to me</span>
          {week.notes.map((n, i) => (
            <blockquote key={i} className="quote">
              {n.text}
              <span className="tiny muted"> {new Date(n.on).toLocaleString()}</span>
            </blockquote>
          ))}
        </div>
      )}
      {week.listening.length > 0 && (
        <div className="stack-sm">
          <span className="label">Listening log</span>
          {week.listening.map((l, i) => (
            <p key={i} className="small">
              <b>
                {l.artist} {l.track}
              </b>
              {l.noticed && ` Noticed: ${l.noticed}`}
              {l.steal && ` Want to steal: ${l.steal}`}
            </p>
          ))}
        </div>
      )}
      <FamilyLinkLine student={student} />
    </section>
  );
}

export function familyUrl(token: string): string {
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}#/f/${token}`;
}

function FamilyLinkLine({ student }: { student: Student }) {
  if (!student.familyKey)
    return (
      <p className="small muted">
        No family link yet. Make one in <a href={href(`/s/${student.id}/profile`)}>Profile</a>.
      </p>
    );
  const url = familyUrl(student.familyKey);
  return (
    <div className="row-wrap small">
      <span className="muted">Family page:</span>
      <a href={url} target="_blank" rel="noreferrer">
        open
      </a>
      <CopyButton text={url} label="Copy link" small />
    </div>
  );
}
