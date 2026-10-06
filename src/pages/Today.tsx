import { useMemo } from "react";
import { useData } from "../data/store";
import { currentWeek, nameOf, roster, teachingDaysInUse } from "../data/select";
import { startLesson } from "../data/actions";
import { owedPromises } from "../../shared/board";
import { retestQueue, skillLabel } from "../../shared/ladders";
import { addDays, clockLabel, isoDate, longDate, nextWeekday, weekdayOf } from "../../shared/dates";
import { slotOrder } from "../../shared/records";
import { href, navigate } from "../router";
import { Chip, Empty, Icon } from "../components/ui";

/**
 * The day in slot order: each slot with Ask first, the Done when lines to
 * check, and Check before you teach. One tap starts the lesson.
 */
export function Today({ date }: { date?: string }) {
  const students = useData("students");
  const weeks = useData("weeks");
  const lessons = useData("lessons");
  const promises = useData("promises");
  const threads = useData("threads");
  const progress = useData("progress");
  const skills = useData("skills");
  const today = isoDate();
  const days = teachingDaysInUse({ students });

  // With no date asked for, show today if it is a teaching day, otherwise the next one.
  const day = date ?? (days.includes(weekdayOf(today)) ? today : days.map((d) => nextWeekday(d, today)).sort()[0] ?? today);
  const slots = useMemo(() => roster({ students }, day), [students, day]);
  const weekday = weekdayOf(day);
  const nextDays = days.map((d) => nextWeekday(d, addDays(day, 1))).sort();

  return (
    <div className="stack">
      <header className="page-head spread">
        <div>
          <span className="eyebrow">{day === today ? "Today" : day < today ? "Earlier" : "Coming up"}</span>
          <h1>{longDate(day)}</h1>
          <p className="muted">
            {slots.length} {slots.length === 1 ? "lesson" : "lessons"}
            {slots[0]?.location ? `, ${slots[0].location}` : ""}. The schedule here is the regular roster; Opus1 has the truth for make-ups and cancellations.
          </p>
        </div>
        <div className="row-wrap">
          <a className="btn btn-sm btn-ghost" href={href(`/today/${days.map((d) => nextWeekday(d, addDays(day, -7))).filter((x) => x < day).sort().pop() ?? addDays(day, -7)}`)} aria-label="Earlier teaching day">
            <Icon name="back" size={18} />
          </a>
          {day !== today && (
            <a className="btn btn-sm" href={href("/")}>
              Today
            </a>
          )}
          <a className="btn btn-sm btn-ghost" href={href(`/today/${nextDays[0] ?? addDays(day, 7)}`)} aria-label="Next teaching day">
            <Icon name="next" size={18} />
          </a>
          <a className="btn btn-sm" href={href(`/export/${weekday}/${day}`)}>
            <Icon name="download" size={18} /> Records file
          </a>
          <button className="btn btn-sm btn-ghost" type="button" onClick={() => window.print()}>
            <Icon name="print" size={18} /> Print
          </button>
        </div>
      </header>

      {slots.length === 0 ? (
        <Empty>No lessons on {weekday} in the roster. Slots come from the Slot and Time columns in the Students database.</Empty>
      ) : (
        <ol className="slots plain">
          {slots.map((s) => {
            const week = currentWeek({ weeks }, s.id, day);
            const lesson = lessons.find((l) => l.student === s.id && l.date === day);
            const owed = owedPromises(promises, s.id);
            const retests = retestQueue(progress, skills, s.id);
            const decisions = threads.filter((t) => t.student === s.id && t.status === "Needs a decision");
            const time = s.times[0] ? clockLabel(s.times[0]) : "";
            const onHold = s.status === "Pause";
            return (
              <li key={s.id} className={`slot card ${onHold ? "on-hold" : ""}`} style={{ borderLeftColor: s.accent || undefined }}>
                <div className="slot-head">
                  <span className="slot-time num">{time || `#${Math.floor(slotOrder(s, weekday) / 10_000)}`}</span>
                  <Chip name={nameOf(s)} accent={s.accent} size={36} />
                  <div className="grow">
                    <a className="slot-name" href={href(`/s/${s.id}`)}>
                      {nameOf(s)}
                    </a>
                    <div className="small muted">{week?.sheet.song || s.repertoire || "No current piece"}</div>
                  </div>
                  {onHold ? (
                    <span className="pill">On hold</span>
                  ) : lesson?.startedAt ? (
                    <a className="btn btn-sm" href={href(`/lesson/${s.id}`)}>
                      <Icon name="mic" size={18} /> Started {new Date(lesson.startedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                    </a>
                  ) : (
                    <button
                      className="btn btn-sm btn-primary"
                      type="button"
                      onClick={() => {
                        startLesson(s.id, day);
                        navigate(`/lesson/${s.id}`);
                      }}
                    >
                      <Icon name="play" size={16} /> Start
                    </button>
                  )}
                </div>
                {!onHold && (
                  <div className="slot-body">
                    {week?.sheet.askFirst && (
                      <p>
                        <b>Ask first, before you model.</b> {week.sheet.askFirst}
                      </p>
                    )}
                    {week && (
                      <div>
                        <b>Done when</b>
                        <ul className="plain small">
                          {week.sheet.cards
                            .filter((c) => c.t)
                            .map((c) => (
                              <li key={c.id}>
                                {c.code && <span className="code">{c.code}</span>} {c.t}: {c.done || <span className="muted">no Done when; it waits for you</span>}
                                {c.outcome && <span className={`pill ${c.outcome === "met" ? "pill-good" : ""}`}> {c.outcome}</span>}
                              </li>
                            ))}
                        </ul>
                      </div>
                    )}
                    {(owed.length > 0 || retests.length > 0 || decisions.length > 0 || !!week?.sheet.checkFirst || s.flags.length > 0 || !!week?.notes.length) && (
                      <div className="check-first">
                        <b>Check before you teach</b>
                        <ul className="plain small">
                          {owed.map((p) => (
                            <li key={p.id}>
                              Owed: {p.what} <span className="muted">({p.state}, said {p.saidOn})</span>
                            </li>
                          ))}
                          {retests.map((r) => (
                            <li key={r.item.id}>
                              Retest {r.item.rung} skill {skillLabel(r.item)} with prompt set B: {r.item.skill}
                            </li>
                          ))}
                          {decisions.map((t) => (
                            <li key={t.id}>Needs your decision: {t.name}</li>
                          ))}
                          {s.flags.map((f) => (
                            <li key={f}>{f}</li>
                          ))}
                          {week?.sheet.checkFirst && <li>{week.sheet.checkFirst}</li>}
                          {week?.notes.slice(-1).map((n, i) => (
                            <li key={i}>
                              They wrote: <i>{n.text}</i>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {!week && <p className="small muted">No sheet yet. <a href={href(`/s/${s.id}`)}>Start one</a>.</p>}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
