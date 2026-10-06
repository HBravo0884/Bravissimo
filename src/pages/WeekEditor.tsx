import { useMemo, useState } from "react";
import { store, useData } from "../data/store";
import { nameOf, studentById, weeksFor } from "../data/select";
import { updateSheet } from "../data/actions";
import { blankCard, routineTotal, sheetProblems, toRecord, type Problem } from "../../shared/records";
import { carriedTag } from "../../shared/labels";
import { CATEGORY_HINTS, CATEGORY_NAMES } from "../../shared/levelup";
import { familyView } from "../../shared/family";
import { longDate } from "../../shared/dates";
import { CODES, LANES, WEEK_STATUSES, type Card, type QR, type RoutineItem, type Sheet, type Student, type Week } from "../../shared/types";
import { href } from "../router";
import { Chip, CopyButton, Empty, Icon, Sheet as Dialog, TextField } from "../components/ui";
import { FamilyWeek } from "../components/FamilyWeek";

const FIGURES = ["cmaj5", "cscale", "iivi", "modes", "dminor", "g7trio", "cshapes", "registers", "blackgroups", "halfsteps", "whitesharps", "dmajmin", "cdimpair", "gsharp7"];

function fresh(id: string): Week | undefined {
  return store.data().weeks.find((w) => w.id === id);
}

export function WeekEditor({ studentId, weekId }: { studentId: string; weekId: string }) {
  const students = useData("students");
  const weeks = useData("weeks");
  const challenges = useData("challenges");
  const rungs = useData("rungs");
  const resources = useData("resources");
  const progress = useData("progress");
  const student = studentById({ students }, studentId);
  const week = weeks.find((w) => w.id === weekId);
  const [preview, setPreview] = useState(false);

  const problems = useMemo(() => (week && student ? sheetProblems(week.sheet, student) : []), [week, student]);
  if (!student || !week) return <Empty>That sheet is not on this device. It may still be loading from Notion.</Empty>;

  const save = (patch: Partial<Sheet>) => {
    const w = fresh(week.id);
    if (w) updateSheet(w, patch);
  };
  const saveCard = (cardId: string, patch: Partial<Card>) => {
    const w = fresh(week.id);
    if (w) updateSheet(w, { cards: w.sheet.cards.map((c) => (c.id === cardId ? { ...c, ...patch } : c)) });
  };
  const prev = weeksFor({ weeks }, student.id).find((w) => w.date < week.date);
  const errors = problems.filter((p) => p.level === "error");
  const sheet = week.sheet;
  const plays = student.pointsMode === "plays for points";
  const open = challenges.filter((c) => c.student === student.id && c.state === "open");

  return (
    <div className="editor">
      <header className="page-head row">
        <a className="btn btn-ghost btn-sm" href={href(`/s/${student.id}`)} aria-label="Back to the student">
          <Icon name="back" />
        </a>
        <Chip name={nameOf(student)} accent={student.accent} />
        <div className="grow">
          <span className="eyebrow">
            {nameOf(student)}
            {student.lang === "es" ? ", in Spanish" : ""}
          </span>
          <h1>Sheet for {longDate(week.date)}</h1>
        </div>
      </header>

      <div className="editor-grid">
        <div className="stack">
          <section className="card pad stack">
            <h2>Side one</h2>
            <TextField label="Your song right now" value={sheet.song} onSave={(v) => save({ song: v })} hint={student.repertoire && student.repertoire !== sheet.song ? `Notion's Repertoire: ${student.repertoire}` : undefined} />
            <TextField label="How to approach it this week" value={sheet.songNote} multiline onSave={(v) => save({ songNote: v })} />
            <TextField label="Last time" value={sheet.last} onSave={(v) => save({ last: v })} placeholder="Last time: ..." hint={week.builtFrom === "carried" ? "This sheet carries over: no record of the last lesson." : undefined} />
            <Wins week={week} save={save} />
          </section>

          {sheet.cards.map((c, i) => (
            <CardEditor
              key={c.id}
              card={c}
              index={i}
              student={student}
              prevOutcome={prev?.sheet.cards.find((p) => p.t === c.t)?.outcome}
              openChallenges={open}
              rungs={rungs.map((r) => r.code)}
              onSave={(patch) => saveCard(c.id, patch)}
              onMove={(dir) => {
                const w = fresh(week.id)!;
                const cards = [...w.sheet.cards];
                const j = i + dir;
                if (j < 0 || j >= cards.length) return;
                [cards[i], cards[j]] = [cards[j], cards[i]];
                updateSheet(w, { cards });
              }}
              onToKeep={() => {
                const w = fresh(week.id)!;
                updateSheet(w, { keep: { t: c.t, d: c.d }, cards: w.sheet.cards.map((x) => (x.id === c.id ? blankCard() : x)) });
              }}
            />
          ))}
          {sheet.cards.length !== 4 && (
            <button className="btn" type="button" onClick={() => save({ cards: [...sheet.cards, ...Array.from({ length: Math.max(0, 4 - sheet.cards.length) }, blankCard)].slice(0, 4) })}>
              Make it four cards
            </button>
          )}

          <Routine week={week} save={save} young={student.ageBand === "under 8"} />

          <section className="card pad stack">
            <h2>Side two</h2>
            <div className="grid-2">
              <TextField label="Keep it alive" value={sheet.keep.t} onSave={(v) => save({ keep: { ...fresh(week.id)!.sheet.keep, t: v } })} hint="What the lesson did not touch stays warm here." />
              <TextField label="How" value={sheet.keep.d} onSave={(v) => save({ keep: { ...fresh(week.id)!.sheet.keep, d: v } })} placeholder="Once through, any day this week." />
            </div>
            {plays ? (
              <div className="field">
                <span>Challenges you are working on (two to four)</span>
                {open.length === 0 && <small className="hint">No open challenge. Open one on the student's Challenges tab.</small>}
                {open.map((c) => (
                  <label key={c.id} className="check">
                    <input
                      type="checkbox"
                      checked={sheet.challenges.includes(c.id)}
                      onChange={(e) => {
                        const cur = fresh(week.id)!.sheet.challenges;
                        save({ challenges: e.target.checked ? [...cur, c.id] : cur.filter((x) => x !== c.id) });
                      }}
                    />
                    <span className="code">{c.code}</span> {c.name}
                  </label>
                ))}
                <TextField label="Challenge note" value={sheet.chalNote} onSave={(v) => save({ chalNote: v })} hint="Printed before the fixed line about blocks and practice days." />
              </div>
            ) : (
              <p className="small muted">No challenges block: this student does not play for points.</p>
            )}
            <label className="check">
              <input type="checkbox" checked={sheet.listen} onChange={(e) => save({ listen: e.target.checked })} />
              Listening log on the sheet
            </label>
            <div className="grid-3">
              <label className="field">
                <span>Picture</span>
                <input className="input" list="figures" value={sheet.fig} onChange={(e) => save({ fig: e.target.value.trim() })} />
                <datalist id="figures">
                  {FIGURES.map((f) => (
                    <option key={f} value={f} />
                  ))}
                </datalist>
              </label>
              <TextField label="Picture song" value={sheet.figSong} onSave={(v) => save({ figSong: v })} />
              <TextField label="Picture heading" value={sheet.figLabel} onSave={(v) => save({ figLabel: v })} placeholder="The picture for this week" />
            </div>
            <Quiz week={week} save={save} />
          </section>

          <Codes week={week} student={student} save={save} resources={resources.map((r) => r.key)} />

          <section className="card pad stack">
            <h2>Note to the adult at home</h2>
            <p className="muted small">Instructions and reassurance, never a description of the child. Leave empty for no note.</p>
            <div className="grid-2">
              <TextField label="Heading" value={sheet.adultNote?.t ?? ""} placeholder={student.familyLang === "es" ? "En casa" : "At home"} onSave={(v) => save({ adultNote: v || sheet.adultNote?.d ? { t: v, d: fresh(week.id)!.sheet.adultNote?.d ?? "" } : null })} />
            </div>
            <TextField
              label="Note"
              multiline
              rows={3}
              value={Array.isArray(sheet.adultNote?.d) ? sheet.adultNote!.d.join("\n\n") : (sheet.adultNote?.d ?? "")}
              onSave={(v) => {
                const paras = v.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
                const t = fresh(week.id)!.sheet.adultNote?.t ?? "";
                save({ adultNote: paras.length || t ? { t, d: paras.length > 1 ? paras : (paras[0] ?? "") } : null });
              }}
              hint="A blank line starts a new paragraph."
            />
          </section>

          <section className="card pad stack">
            <h2>For you only</h2>
            <TextField label="Ask first, before you model" value={sheet.askFirst} onSave={(v) => save({ askFirst: v })} hint="Shows on Today. Never on the sheet." />
            <TextField label="Check before you teach" value={sheet.checkFirst} multiline onSave={(v) => save({ checkFirst: v })} hint="Things said in the room that stay off paper, unverified titles, points to confirm." />
          </section>
        </div>

        <aside className="editor-side stack">
          <section className="card pad stack-sm">
            <label className="field">
              <span>Status</span>
              <select className="input" value={week.status} onChange={(e) => store.update("weeks", week.id, { status: e.target.value as Week["status"] })}>
                {WEEK_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <small className="hint">The family page shows a sheet only once it is checked.</small>
            </label>
            {week.status === "draft" && (
              <button className="btn btn-primary" type="button" disabled={errors.length > 0} onClick={() => store.update("weeks", week.id, { status: "verified" })} title={errors.length ? "Fix the problems first" : undefined}>
                <Icon name="check" size={18} /> I have read it
              </button>
            )}
            <button className="btn" type="button" onClick={() => setPreview(true)}>
              See the family page
            </button>
            <CopyButton text={JSON.stringify(toRecord(student, week, challenges), null, 2)} label="Copy its record" small />
          </section>
          <ProblemList problems={problems} />
        </aside>
      </div>

      <Dialog open={preview} onClose={() => setPreview(false)} title="What the family sees" wide>
        <div className="family-frame">
          <FamilyWeek view={familyView({ student, week: { ...week, status: week.status === "draft" ? "verified" : week.status }, challenges, progress, rungs, resources })} />
        </div>
        {week.status === "draft" && <p className="small muted">This is a draft; the family sees it once you mark it read.</p>}
      </Dialog>
    </div>
  );
}

export function ProblemList({ problems }: { problems: Problem[] }) {
  if (!problems.length)
    return (
      <section className="card pad">
        <p className="good-text">
          <Icon name="check" size={18} /> Passes the build checks.
        </p>
      </section>
    );
  return (
    <section className="card pad stack-sm" aria-live="polite">
      <h3>Before it can print</h3>
      <ul className="problems">
        {problems.map((p, i) => (
          <li key={i} className={p.level}>
            <b>{p.where}</b> {p.text}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Wins({ week, save }: { week: Week; save: (p: Partial<Sheet>) => void }) {
  const lessons = useData("lessons").filter((l) => l.student === week.student && l.date <= week.date);
  const documented = [...new Set(lessons.flatMap((l) => l.capture?.wins ?? []))].filter((w) => !week.sheet.wins.includes(w)).slice(0, 4);
  const [draft, setDraft] = useState("");
  const wins = week.sheet.wins;
  return (
    <div className="field">
      <span>Recent wins (up to two, documented only)</span>
      {wins.map((w, i) => (
        <div key={i} className="row">
          <input className="input grow" defaultValue={w} onBlur={(e) => save({ wins: fresh(week.id)!.sheet.wins.map((x, j) => (j === i ? e.target.value : x)).filter(Boolean) })} aria-label={`Win ${i + 1}`} />
          <button className="btn btn-sm btn-ghost" type="button" aria-label="Remove this win" onClick={() => save({ wins: fresh(week.id)!.sheet.wins.filter((_, j) => j !== i) })}>
            <Icon name="close" size={18} />
          </button>
        </div>
      ))}
      {wins.length < 2 && (
        <>
          {documented.length > 0 && (
            <div className="row-wrap">
              <small className="hint">From the lesson record:</small>
              {documented.map((w) => (
                <button key={w} className="pill-button" type="button" onClick={() => save({ wins: [...fresh(week.id)!.sheet.wins, w].slice(0, 2) })}>
                  {w}
                </button>
              ))}
            </div>
          )}
          <div className="row">
            <input className="input grow" value={draft} placeholder="A comparative: stopped at bar 6 then, through to the end today" onChange={(e) => setDraft(e.target.value)} aria-label="New win" />
            <button
              className="btn btn-sm"
              type="button"
              disabled={!draft.trim()}
              onClick={() => {
                save({ wins: [...fresh(week.id)!.sheet.wins, draft.trim()].slice(0, 2) });
                setDraft("");
              }}
            >
              Add
            </button>
          </div>
        </>
      )}
      <small className="hint">No documented win, no block. Approval is not improvement.</small>
    </div>
  );
}

function CardEditor({
  card,
  index,
  student,
  prevOutcome,
  openChallenges,
  rungs,
  onSave,
  onMove,
  onToKeep,
}: {
  card: Card;
  index: number;
  student: Student;
  prevOutcome?: string;
  openChallenges: { id: string; code: string; name: string }[];
  rungs: string[];
  onSave: (p: Partial<Card>) => void;
  onMove: (dir: -1 | 1) => void;
  onToKeep: () => void;
}) {
  return (
    <section className="card pad stack card-editor" style={{ borderTopColor: student.accent || undefined }}>
      <div className="spread">
        <h2>Card {index + 1}</h2>
        <div className="row">
          <button className="btn btn-sm btn-ghost" type="button" aria-label="Move up" disabled={index === 0} onClick={() => onMove(-1)}>
            <Icon name="up" size={18} />
          </button>
          <button className="btn btn-sm btn-ghost" type="button" aria-label="Move down" disabled={index === 3} onClick={() => onMove(1)}>
            <Icon name="down" size={18} />
          </button>
          <button className="btn btn-sm btn-ghost" type="button" onClick={onToKeep} title="Move it to Keep it alive and start a fresh card">
            To Keep it alive
          </button>
        </div>
      </div>
      {(card.carriedFrom || prevOutcome) && (
        <p className="small">
          {card.carriedFrom && (
            <span className="pill pill-peach">
              {carriedTag(card.carriedFrom, student.lang)}{" "}
              <button className="linklike" type="button" onClick={() => onSave({ carriedFrom: "" })}>
                clear
              </button>
            </span>
          )}{" "}
          {prevOutcome && <span className="muted">Last week: {prevOutcome}</span>}
        </p>
      )}
      <div className="grid-3">
        <label className="field">
          <span>Code</span>
          <select className="input" value={card.code} onChange={(e) => onSave({ code: e.target.value as Card["code"] })}>
            <option value="">Choose</option>
            {CODES.map((c) => (
              <option key={c} value={c}>
                {c} {CATEGORY_NAMES[c]}
              </option>
            ))}
          </select>
          {card.code && <small className="hint">For {CATEGORY_HINTS[card.code]}.</small>}
        </label>
        <label className="field">
          <span>Lane</span>
          <select className="input" value={card.lane} onChange={(e) => onSave({ lane: e.target.value as Card["lane"] })}>
            <option value="">None</option>
            {LANES.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={card.youPick} onChange={(e) => onSave({ youPick: e.target.checked })} />
          You pick
        </label>
      </div>
      <TextField label="Title" value={card.t} onSave={(v) => onSave({ t: v })} />
      <TextField label="What to do" value={card.d} multiline onSave={(v) => onSave({ d: v })} hint="Which bars, which fingers. Minutes and counts live in the routine." />
      <TextField label="Done when" value={card.done} onSave={(v) => onSave({ done: v })} hint="A result the student can check alone. Never invent one: empty waits for you." />
      <div className="grid-2">
        <TextField label="Still true when" value={card.still} onSave={(v) => onSave({ still: v })} hint="A retention check after a gap." />
        <TextField label="From the shelf" value={card.book} onSave={(v) => onSave({ book: v })} />
      </div>
      <div className="grid-2">
        <label className="field">
          <span>Feeds the challenge</span>
          <select className="input" value={card.feeds} onChange={(e) => onSave({ feeds: e.target.value })}>
            <option value="">None</option>
            {openChallenges.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Rung</span>
          <select className="input" value={card.rung} onChange={(e) => onSave({ rung: e.target.value })}>
            <option value="">None</option>
            {rungs.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
      </div>
    </section>
  );
}

const TOTALS = [15, 20, 25, 30];

function Routine({ week, save, young }: { week: Week; save: (p: Partial<Sheet>) => void; young: boolean }) {
  const routine = week.sheet.routine;
  const total = routineTotal(routine);
  const setItem = (i: number, patch: Partial<RoutineItem>) => save({ routine: fresh(week.id)!.sheet.routine.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  return (
    <section className="card pad stack">
      <div className="spread">
        <h2>Practice routine</h2>
        <span className={`pill ${TOTALS.includes(total) ? "pill-good" : "pill-warn"}`}>{total} minutes</span>
      </div>
      <p className="muted small">Warm-up, a block per card, ending in free play, protected. Nothing under five minutes; 30 in all, or 25, 20 or 15 {young ? "(this student is under 8)" : "for the youngest"}.</p>
      <ul className="routine plain">
        {routine.map((r, i) => (
          <li key={i} className="row">
            <select className="input input-min" value={r.min} onChange={(e) => setItem(i, { min: Number(e.target.value) })} aria-label="Minutes">
              {[5, 10, 15, 20, 25, 30].map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
            <input className="input grow" defaultValue={r.text} key={`${i}-${r.text}`} onBlur={(e) => e.target.value !== r.text && setItem(i, { text: e.target.value })} aria-label={`Routine line ${i + 1}`} />
            <select className="input input-kind" value={r.card || r.kind} onChange={(e) => {
              const v = e.target.value;
              const isCard = week.sheet.cards.some((c) => c.id === v);
              setItem(i, isCard ? { card: v, kind: "card block" } : { card: "", kind: v as RoutineItem["kind"] });
            }} aria-label="What this block is">
              <option value="">Block</option>
              <option value="warm-up">Warm-up</option>
              {week.sheet.cards.map((c, k) => (
                <option key={c.id} value={c.id}>
                  Card {k + 1}
                </option>
              ))}
              <option value="keep-alive">Keep it alive</option>
              <option value="free play">Free play</option>
            </select>
            <button className="btn btn-sm btn-ghost" type="button" aria-label="Remove this line" onClick={() => save({ routine: fresh(week.id)!.sheet.routine.filter((_, j) => j !== i) })}>
              <Icon name="close" size={18} />
            </button>
          </li>
        ))}
      </ul>
      <div className="btn-row">
        <button className="btn btn-sm" type="button" onClick={() => save({ routine: [...fresh(week.id)!.sheet.routine, { min: 5, text: "", kind: "", card: "" }] })}>
          <Icon name="plus" size={18} /> A line
        </button>
        {routine.length === 0 && (
          <button
            className="btn btn-sm"
            type="button"
            onClick={() => {
              const cards = fresh(week.id)!.sheet.cards;
              save({
                routine: [
                  { min: 5, text: "warm-up", kind: "warm-up", card: "" },
                  ...cards.map((c) => ({ min: 5, text: c.t.toLowerCase(), kind: "card block" as const, card: c.id })),
                  { min: 5, text: "free play", kind: "free play", card: "" },
                ],
              });
            }}
          >
            Build it from the cards
          </button>
        )}
      </div>
    </section>
  );
}

function Quiz({ week, save }: { week: Week; save: (p: Partial<Sheet>) => void }) {
  const quiz = (week.sheet.quiz ?? null) as { items?: string[]; done?: string } | null;
  const [on, setOn] = useState(!!quiz);
  return (
    <div className="stack-sm">
      <label className="check">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => {
            setOn(e.target.checked);
            if (!e.target.checked) save({ quiz: null });
          }}
        />
        Fill in the blanks
      </label>
      {on && (
        <>
          <TextField
            label="Items, one per line; {} is a blank"
            multiline
            rows={4}
            value={(quiz?.items ?? []).join("\n")}
            onSave={(v) => save({ quiz: { items: v.split("\n").map((x) => x.trim()).filter(Boolean), done: quiz?.done ?? "" } })}
          />
          <TextField label="Done when" value={quiz?.done ?? ""} onSave={(v) => save({ quiz: { items: quiz?.items ?? [], done: v } })} hint="The answer key stays with you." />
        </>
      )}
    </div>
  );
}

function qrParts(q: QR): { kind: "none" | "url" | "id"; url: string; label: string; id: string } {
  if (!q) return { kind: "none", url: "", label: "", id: "" };
  if (typeof q === "string") return { kind: "url", url: q, label: "", id: "" };
  if ("id" in q) return { kind: "id", url: "", label: "", id: q.id };
  return { kind: "url", url: q.url, label: q.label, id: "" };
}

function QrField({ label, value, onSave, resources, defaultLabel }: { label: string; value: QR; onSave: (q: QR) => void; resources: string[]; defaultLabel: string }) {
  const p = qrParts(value);
  return (
    <div className="field">
      <span>{label}</span>
      <div className="row-wrap">
        <select
          className="input input-kind"
          value={p.kind}
          onChange={(e) => onSave(e.target.value === "none" ? null : e.target.value === "id" ? { id: resources[0] ?? "" } : { url: p.url, label: p.label || defaultLabel })}
          aria-label={`${label}: kind`}
        >
          <option value="none">None</option>
          <option value="url">A link</option>
          <option value="id">A checked tool</option>
        </select>
        {p.kind === "id" && (
          <select className="input grow" value={p.id} onChange={(e) => onSave({ id: e.target.value })} aria-label={`${label}: tool`}>
            {resources.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        )}
        {p.kind === "url" && (
          <>
            <input className="input grow" type="url" defaultValue={p.url} key={p.url} placeholder="https://" onBlur={(e) => onSave({ url: e.target.value.trim(), label: p.label || defaultLabel })} aria-label={`${label}: link`} />
            <input className="input input-label" defaultValue={p.label} key={`l${p.label}`} placeholder={defaultLabel} onBlur={(e) => onSave({ url: p.url, label: e.target.value.trim() || defaultLabel })} aria-label={`${label}: label`} />
          </>
        )}
      </div>
    </div>
  );
}

function Codes({ week, student, save, resources }: { week: Week; student: Student; save: (p: Partial<Sheet>) => void; resources: string[] }) {
  const sheet = week.sheet;
  return (
    <section className="card pad stack">
      <h2>Codes</h2>
      <p className="muted small">Playlist, Music and one or two tools, each with a plain label. Every code is decoded from the printed PDF before it ships.</p>
      <TextField label="Playlist" value={sheet.playlist} placeholder={student.playlist || "From the student's profile"} onSave={(v) => save({ playlist: v.trim() })} hint={student.playlist && !sheet.playlist ? "Uses the profile's playlist." : undefined} />
      <QrField label="Music (the score)" value={sheet.qrSong} onSave={(q) => save({ qrSong: q })} resources={resources} defaultLabel="Music" />
      <QrField label="Second code" value={sheet.qr2} onSave={(q) => save({ qr2: q })} resources={resources} defaultLabel="Tool" />
      <QrField label="Third code" value={sheet.qr3} onSave={(q) => save({ qr3: q })} resources={resources} defaultLabel="Tool" />
      <TextField label="Text when there is no playlist code" value={sheet.noqrText ?? ""} onSave={(v) => save({ noqrText: v.trim() || null })} placeholder="Ask me for your playlist link and I will send it." />
    </section>
  );
}
