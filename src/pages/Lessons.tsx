import { useMemo, useState } from "react";
import { store, useData } from "../data/store";
import { nameOf, studentById } from "../data/select";
import { updateCapture } from "../data/actions";
import { longDate, timeOfDay } from "../../shared/dates";
import { LESSON_STATUSES, type Lesson } from "../../shared/types";
import { href } from "../router";
import { Empty, Icon, Segmented, TextField } from "../components/ui";

const STATUS_HELP: Record<string, string> = {
  "": "Captured in the room; not reviewed yet.",
  "Transcript only": "The transcript is in; nothing extracted yet.",
  Logged: "What changed, Evidence, Assigned and Unresolved are written.",
  "Report drafted": "A report draft exists.",
  "Report posted": "You posted the report in Opus1.",
};

/** The lesson records: what the room captured and what the studio run drafted, for one pass the same evening. */
export function Lessons() {
  const lessons = useData("lessons");
  const students = useData("students");
  const [show, setShow] = useState<"review" | "all">("review");
  const list = useMemo(
    () =>
      lessons
        .filter((l) => (show === "all" ? true : l.status === "" || l.status === "Transcript only" || !l.whatChanged))
        .sort((a, b) => b.date.localeCompare(a.date) || (b.startedAt || "").localeCompare(a.startedAt || "")),
    [lessons, show],
  );
  return (
    <div className="stack">
      <header className="page-head">
        <span className="eyebrow">Lesson records</span>
        <h1>{show === "review" ? `${list.length} to review` : `${list.length} lessons`}</h1>
        <p className="muted">One row per student per lesson, in the tracker's Lessons database. Claude's drafts and your taps land here; you confirm them in one pass.</p>
      </header>
      <Segmented
        label="Which lessons"
        value={show}
        options={[
          { id: "review", label: "To review" },
          { id: "all", label: "All" },
        ]}
        onChange={setShow}
      />
      {list.length === 0 ? (
        <Empty>{show === "review" ? "Nothing waiting. Every lesson on record has What changed." : "No lessons on record yet."}</Empty>
      ) : (
        <ul className="list card">
          {list.map((l) => {
            const s = studentById({ students }, l.student);
            return (
              <li key={l.id}>
                <a className="list-row" href={href(`/lessons/${l.id}`)}>
                  <div className="grow">
                    <div className="row-wrap">
                      <b>{s ? nameOf(s) : l.name}</b>
                      <span className="muted small">{longDate(l.date)}</span>
                      <span className={`pill ${l.status === "Report posted" ? "pill-good" : !l.status ? "pill-warn" : ""}`}>{l.status || "Captured"}</span>
                    </div>
                    <div className="small">{l.whatChanged || <span className="muted">What changed is not written yet.</span>}</div>
                  </div>
                  <Icon name="next" size={18} />
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function LessonReview({ lessonId }: { lessonId: string }) {
  const lessons = useData("lessons");
  const students = useData("students");
  const threads = useData("threads");
  const weeks = useData("weeks");
  const lesson = lessons.find((l) => l.id === lessonId);
  if (!lesson) return <Empty>That lesson is not on this device.</Empty>;
  const student = studentById({ students }, lesson.student);
  const up = (patch: Partial<Lesson>) => store.update("lessons", lesson.id, patch);
  const cap = lesson.capture ?? { wins: [], parentAsks: [], notes: [], outcomes: [], recital: "" };
  const mine = threads.filter((t) => t.student === lesson.student || !t.student).filter((t) => !["Resolved", "Dropped"].includes(t.status) || lesson.threads.includes(t.id));

  return (
    <div className="stack page-narrow">
      <header className="page-head row">
        <a className="btn btn-ghost btn-sm" href={href("/lessons")} aria-label="All lessons">
          <Icon name="back" />
        </a>
        <div className="grow">
          <span className="eyebrow">{student ? nameOf(student) : "Lesson"}</span>
          <h1>{longDate(lesson.date)}</h1>
          {lesson.startedAt && <p className="small muted">Started {timeOfDay(lesson.startedAt)}: look for it there on the day's recording.</p>}
        </div>
      </header>

      <section className="card pad stack">
        <label className="field">
          <span>Status</span>
          <select className="input" value={lesson.status} onChange={(e) => up({ status: e.target.value })}>
            <option value="">Captured</option>
            {LESSON_STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <small className="hint">{STATUS_HELP[lesson.status] ?? ""} Only you set Report posted, after you post it.</small>
        </label>
        <TextField label="What changed" multiline value={lesson.whatChanged} onSave={(v) => up({ whatChanged: v })} hint="The observable difference between the start and end of this lesson. One thing, stated plainly. If nothing changed, say so." />
        <TextField label="Evidence" multiline value={lesson.evidence} onSave={(v) => up({ evidence: v })} hint="The moment that shows it, quote or near-quote, with its time on the recording." />
        <TextField label="Assigned" multiline value={lesson.assigned} onSave={(v) => up({ assigned: v })} hint="What the student leaves with. Cards, pieces, exercises." />
        <TextField label="Unresolved" multiline value={lesson.unresolved} onSave={(v) => up({ unresolved: v })} hint="A question not answered, a decision deferred, something owed to the family." />
        <TextField label="Transcript" value={lesson.transcript} type="url" onSave={(v) => up({ transcript: v.trim() })} />
      </section>

      {(cap.wins.length > 0 || cap.outcomes.length > 0 || cap.parentAsks.length > 0 || cap.notes.length > 0 || cap.recital) && (
        <section className="card pad stack-sm">
          <h2>Your taps in the room</h2>
          <ul className="plain small">
            {cap.outcomes.map((o, i) => {
              const w = weeks.find((x) => x.id === o.week);
              const c = w?.sheet.cards.find((x) => x.id === o.card);
              return (
                <li key={`o${i}`}>
                  {c?.t ?? "A card"}: <b>{o.outcome}</b>
                </li>
              );
            })}
            {cap.wins.map((w, i) => (
              <li key={`w${i}`} className="row">
                <span className="grow">Win: {w}</span>
                <button className="btn btn-sm btn-ghost" type="button" onClick={() => updateCapture(lesson, { wins: cap.wins.filter((_, j) => j !== i) })} aria-label="Remove this win">
                  <Icon name="close" size={16} />
                </button>
              </li>
            ))}
            {cap.parentAsks.map((w, i) => (
              <li key={`a${i}`}>Parent asked: {w}</li>
            ))}
            {cap.notes.map((w, i) => (
              <li key={`n${i}`}>Note: {w}</li>
            ))}
            {cap.recital && <li>Recital piece: {cap.recital}</li>}
          </ul>
        </section>
      )}

      <section className="card pad stack-sm">
        <h2>Threads it touched</h2>
        <p className="muted small">Ticking one sets its Last touched to this lesson.</p>
        {mine.length === 0 && <p className="small muted">No open threads for this student.</p>}
        {mine.map((t) => (
          <label key={t.id} className="check">
            <input
              type="checkbox"
              checked={lesson.threads.includes(t.id)}
              onChange={(e) => {
                up({ threads: e.target.checked ? [...lesson.threads, t.id] : lesson.threads.filter((x) => x !== t.id) });
                if (e.target.checked && (!t.lastTouched || t.lastTouched < lesson.date)) store.update("threads", t.id, { lastTouched: lesson.date, lessons: [...new Set([...t.lessons, lesson.id])] });
              }}
            />
            <span>
              {t.name} <span className="muted small">({t.status})</span>
            </span>
          </label>
        ))}
        <a className="small" href={href("/threads")}>
          Open a thread
        </a>
      </section>
    </div>
  );
}
