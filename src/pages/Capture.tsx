import { useState } from "react";
import { store, useData } from "../data/store";
import { currentWeek, nameOf, roster, studentById } from "../data/select";
import { addPromise, setOutcome, startLesson, updateCapture } from "../data/actions";
import { isoDate, longDate } from "../../shared/dates";
import { PROMISE_KINDS, type Lesson, type Outcome } from "../../shared/types";
import { href, navigate } from "../router";
import { Chip, Empty, Icon, Sheet } from "../components/ui";

type Quick = "win" | "promise" | "recital" | "ask" | "note" | "criterion" | null;

/** In the room, one hand, a few taps per student. Everything else waits for the evening. */
export function Capture({ studentId }: { studentId: string }) {
  const students = useData("students");
  const weeks = useData("weeks");
  const lessons = useData("lessons");
  const challenges = useData("challenges");
  const student = studentById({ students }, studentId);
  const today = isoDate();
  const lesson = lessons.find((l) => l.student === studentId && l.date === today);
  const [quick, setQuick] = useState<Quick>(null);

  if (!student) return <Empty>That student is not on this device.</Empty>;
  const week = currentWeek({ weeks }, student.id, today);
  const day = roster({ students }, today);
  const next = day[day.findIndex((s) => s.id === student.id) + 1];
  const ensure = (): Lesson => lesson ?? startLesson(student.id, today);
  const cap = lesson?.capture;

  const outcomeButton = (cardId: string, current: Outcome, value: Outcome, label: string) => (
    <button
      type="button"
      className={`btn outcome ${current === value ? "on" : ""} ${value === "met" ? "met" : ""}`}
      aria-pressed={current === value}
      onClick={() => week && setOutcome(store.data().weeks.find((w) => w.id === week.id)!, cardId, current === value ? "" : value, ensure())}
    >
      {label}
    </button>
  );

  return (
    <div className="stack capture">
      <header className="page-head row">
        <a className="btn btn-ghost btn-sm" href={href("/")} aria-label="Back to today">
          <Icon name="back" />
        </a>
        <Chip name={nameOf(student)} accent={student.accent} size={44} />
        <div className="grow">
          <h1>{nameOf(student)}</h1>
          <p className="small muted">
            {lesson?.startedAt ? `Started ${new Date(lesson.startedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}, the marker for the recording` : longDate(today)}
          </p>
        </div>
        {next && (
          <button
            className="btn btn-sm"
            type="button"
            onClick={() => {
              startLesson(next.id, today);
              navigate(`/lesson/${next.id}`);
            }}
          >
            {nameOf(next)} <Icon name="next" size={18} />
          </button>
        )}
      </header>

      {!lesson?.startedAt && (
        <button className="btn btn-primary btn-block" type="button" onClick={() => startLesson(student.id, today)}>
          <Icon name="play" size={18} /> Start the lesson now
        </button>
      )}

      <section className="stack-sm">
        <h2>Last week's cards</h2>
        {!week ? (
          <p className="muted">No sheet on record.</p>
        ) : (
          week.sheet.cards
            .filter((c) => c.t)
            .map((c) => (
              <div key={c.id} className="card pad stack-sm">
                <div>
                  <b>{c.t}</b>
                  {c.done && <p className="small">Done when {c.done}</p>}
                  {week.gotIt[c.id] && <p className="small muted">The family says they have it ({week.gotIt[c.id]}). Hear it first.</p>}
                </div>
                <div className="outcomes" role="group" aria-label={`${c.t}: outcome`}>
                  {outcomeButton(c.id, c.outcome, "met", "Met")}
                  {outcomeButton(c.id, c.outcome, "not yet", "Not yet")}
                  {outcomeButton(c.id, c.outcome, "not tried", "Not tried")}
                </div>
              </div>
            ))
        )}
      </section>

      <section className="stack-sm">
        <h2>Quick adds</h2>
        <div className="quick-grid">
          <button className="btn" type="button" onClick={() => setQuick("win")}>
            A win
          </button>
          <button className="btn" type="button" onClick={() => setQuick("promise")}>
            A promise
          </button>
          <button className="btn" type="button" onClick={() => setQuick("ask")}>
            A parent ask
          </button>
          <button className="btn" type="button" onClick={() => setQuick("recital")}>
            Recital piece
          </button>
          <button className="btn" type="button" onClick={() => setQuick("criterion")}>
            A criterion
          </button>
          <button className="btn" type="button" onClick={() => setQuick("note")}>
            A note
          </button>
        </div>
        <a className="small" href={href(`/s/${student.id}/ladders`)}>
          Skills Check and ladders
        </a>
      </section>

      {cap && (cap.wins.length > 0 || cap.parentAsks.length > 0 || cap.notes.length > 0 || cap.recital) && (
        <section className="card pad stack-sm">
          <h3>Captured today</h3>
          <ul className="plain small">
            {cap.wins.map((w, i) => (
              <li key={`w${i}`}>Win: {w}</li>
            ))}
            {cap.parentAsks.map((w, i) => (
              <li key={`a${i}`}>Parent asked: {w}</li>
            ))}
            {cap.notes.map((w, i) => (
              <li key={`n${i}`}>Note: {w}</li>
            ))}
            {cap.recital && <li>Recital piece: {cap.recital}</li>}
          </ul>
          <a className="small" href={href(`/lessons/${lesson!.id}`)}>
            Open the lesson record
          </a>
        </section>
      )}

      <QuickSheet
        kind={quick}
        onClose={() => setQuick(null)}
        challenges={challenges.filter((c) => c.student === student.id && c.state === "open")}
        onSave={(kind, text, extra) => {
          const l = ensure();
          const c = { ...{ wins: [] as string[], parentAsks: [] as string[], notes: [] as string[], outcomes: [], recital: "" }, ...(l.capture ?? {}) };
          if (kind === "win") updateCapture(l, { wins: [...c.wins, text] });
          if (kind === "ask") {
            updateCapture(l, { parentAsks: [...c.parentAsks, text] });
            store.update("lessons", l.id, { unresolved: [l.unresolved, `Parent asked: ${text}`].filter(Boolean).join("\n") });
          }
          if (kind === "note") updateCapture(l, { notes: [...c.notes, text] });
          if (kind === "promise") addPromise(student.id, text, extra || "other", l);
          if (kind === "recital") {
            updateCapture(l, { recital: text });
            store.create("repertoire", { student: student.id, title: text, song: "", role: "recital", status: "starting", sound: "", startedOn: today, finishedOn: "", chosenHow: "named in the room", scoreLink: "" });
          }
          if (kind === "criterion" && extra) store.update("challenges", extra, { criterion: text });
          setQuick(null);
        }}
      />
    </div>
  );
}

const PROMPTS: Record<Exclude<Quick, null>, { title: string; placeholder: string; help: string }> = {
  win: { title: "A win", placeholder: "Stopped at bar 6 last week; through to bar 14 today", help: "Only a comparative counts. It reaches a sheet only when you put it there." },
  promise: { title: "A promise", placeholder: "A simplified left hand for the middle section", help: "It stays on Today until it is kept. The sheet never promises it for you." },
  ask: { title: "A parent ask", placeholder: "Can we move to Thursdays in November", help: "Goes to the lesson's Unresolved line." },
  recital: { title: "Recital piece", placeholder: "Title as said in the room", help: "Printed as your recital song this week." },
  criterion: { title: "A criterion, set before playing", placeholder: "Plays bars 1 to 8 twice with no stop", help: "One criterion, written in the notebook in the room." },
  note: { title: "A note", placeholder: "Anything you will want tonight", help: "For the lesson record only." },
};

function QuickSheet({
  kind,
  onClose,
  onSave,
  challenges,
}: {
  kind: Quick;
  onClose: () => void;
  onSave: (kind: Exclude<Quick, null>, text: string, extra: string) => void;
  challenges: { id: string; code: string; name: string }[];
}) {
  const [text, setText] = useState("");
  const [extra, setExtra] = useState("");
  const p = kind ? PROMPTS[kind] : null;
  return (
    <Sheet
      open={!!kind}
      onClose={() => {
        setText("");
        setExtra("");
        onClose();
      }}
      title={p?.title ?? ""}
    >
      {p && kind && (
        <form
          className="stack-sm"
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return;
            onSave(kind, text.trim(), extra || (kind === "criterion" ? challenges[0]?.id ?? "" : ""));
            setText("");
            setExtra("");
          }}
        >
          {kind === "promise" && (
            <select className="input" value={extra} onChange={(e) => setExtra(e.target.value)} aria-label="Kind of promise">
              <option value="">Kind</option>
              {PROMISE_KINDS.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          )}
          {kind === "criterion" && (
            <select className="input" value={extra || challenges[0]?.id || ""} onChange={(e) => setExtra(e.target.value)} aria-label="Challenge">
              {challenges.length === 0 && <option value="">No open challenge</option>}
              {challenges.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} {c.name}
                </option>
              ))}
            </select>
          )}
          <textarea className="input" rows={2} autoFocus value={text} placeholder={p.placeholder} onChange={(e) => setText(e.target.value)} aria-label={p.title} />
          <p className="small muted">{p.help}</p>
          <button className="btn btn-primary btn-block" type="submit" disabled={!text.trim() || (kind === "criterion" && !challenges.length)}>
            Save
          </button>
        </form>
      )}
    </Sheet>
  );
}
