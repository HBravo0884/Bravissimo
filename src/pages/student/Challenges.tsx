import { useState } from "react";
import { store, useData } from "../../data/store";
import { nameOf } from "../../data/select";
import { blocksFromMinutes, formatChallengeCode, parseChallengeCode, templatesFor, validPoints } from "../../../shared/levelup";
import { isoDate } from "../../../shared/dates";
import { Blocks, Empty, Icon, Sheet, TextField } from "../../components/ui";
import type { Student, StudentChallenge } from "../../../shared/types";

export function Challenges({ student }: { student: Student }) {
  const challenges = useData("challenges").filter((c) => c.student === student.id);
  const practice = useData("practice").filter((p) => p.student === student.id);
  const [adding, setAdding] = useState(false);
  const open = challenges.filter((c) => c.state === "open");
  const done = challenges.filter((c) => c.state !== "open").sort((a, b) => (b.completedOn || "").localeCompare(a.completedOn || ""));
  const plays = student.pointsMode === "plays for points";

  const minutesFor = (c: StudentChallenge) => {
    const cat = parseChallengeCode(c.code)?.category;
    return practice.filter((p) => p.date >= (c.openedOn || "0000") && p.countsToward.startsWith(cat ?? "??")).reduce((n, p) => n + p.minutes, 0);
  };

  return (
    <div className="stack">
      {!plays && <p className="banner">This student does not play for points. Challenges stay off the sheet and the family page; anything here is for your own notes.</p>}
      <div className="spread">
        <p className="muted small">A few long challenges at a time. Nothing opens without you, and points land once, when a challenge is finished.</p>
        <button className="btn btn-sm btn-primary" type="button" onClick={() => setAdding(true)}>
          <Icon name="plus" size={18} /> Open a challenge
        </button>
      </div>
      {open.length === 0 ? (
        <Empty>No open challenge.{plays ? " Every student who plays for points holds one." : ""}</Empty>
      ) : (
        <ul className="stack-sm plain">
          {open.map((c) => (
            <ChallengeRow key={c.id} c={c} minutes={c.minutesGoal ? minutesFor(c) : null} />
          ))}
        </ul>
      )}
      {done.length > 0 && (
        <section className="stack-sm">
          <h3>Finished and dropped</h3>
          <ul className="list card">
            {done.map((c) => (
              <li key={c.id} className="list-row static">
                <span className="code">{c.code}</span>
                <span className="grow">{c.name}</span>
                <span className="muted small">
                  {c.state === "complete" ? `${c.points ?? ""} points, ${c.completedOn}` : "dropped"}
                  {c.inNotebook ? ", in the notebook" : ""}
                </span>
                {c.state === "complete" && !c.inNotebook && (
                  <button className="btn btn-sm btn-ghost" type="button" onClick={() => store.update("challenges", c.id, { inNotebook: true })}>
                    Credited in the notebook
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      <AddChallenge student={student} open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}

function ChallengeRow({ c, minutes }: { c: StudentChallenge; minutes: number | null }) {
  const suggested = minutes != null && c.minutesGoal ? blocksFromMinutes(minutes, c.minutesGoal) : null;
  return (
    <li className="card pad stack-sm">
      <div className="spread">
        <div>
          <span className="code">{c.code}</span> <b>{c.name}</b>
          <div className="muted small">
            {c.points ?? "?"} points, opened {c.openedOn || "undated"}
          </div>
        </div>
        <div className="row">
          <button className="btn btn-sm" type="button" aria-label="One block less" disabled={c.blocks <= 0} onClick={() => store.update("challenges", c.id, { blocks: c.blocks - 1 })}>
            -1
          </button>
          <Blocks filled={c.blocks} label={c.name} />
          <button className="btn btn-sm" type="button" aria-label="One block more" disabled={c.blocks >= 10} onClick={() => store.update("challenges", c.id, { blocks: c.blocks + 1 })}>
            +1
          </button>
        </div>
      </div>
      {minutes != null && (
        <p className="small">
          {Math.round(minutes)} of {c.minutesGoal} app minutes since it opened (Reported).
          {suggested != null && suggested !== c.blocks && (
            <>
              {" "}
              That is {suggested} blocks.{" "}
              <button className="linklike" type="button" onClick={() => store.update("challenges", c.id, { blocks: suggested })}>
                Set {suggested}
              </button>
            </>
          )}
        </p>
      )}
      <TextField label="Criterion, set before playing" value={c.criterion} onSave={(v) => store.update("challenges", c.id, { criterion: v })} placeholder="One criterion, written in the notebook in the room" />
      <div className="btn-row">
        <button className="btn btn-sm btn-primary" type="button" onClick={() => window.confirm(`Finish ${c.code}? Its ${c.points ?? ""} points land now.`) && store.update("challenges", c.id, { state: "complete", blocks: 10, completedOn: isoDate() })}>
          Finished
        </button>
        <button className="btn btn-sm btn-ghost" type="button" onClick={() => window.confirm(`Drop ${c.code}?`) && store.update("challenges", c.id, { state: "dropped" })}>
          Drop
        </button>
      </div>
    </li>
  );
}

function AddChallenge({ student, open, onClose }: { student: Student; open: boolean; onClose: () => void }) {
  const level = Number(student.levelUp) || 1;
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [points, setPoints] = useState("");
  const parsed = parseChallengeCode(code);
  const pts = Number(points);
  const valid = !!parsed && name.trim() && validPoints(pts);

  const create = (c: { code: string; name: string; points: number; minutesGoal?: number }) => {
    store.create(
      "challenges",
      { student: student.id, name: c.name, code: formatChallengeCode(c.code), points: c.points, state: "open", criterion: "", blocks: 0, minutesGoal: c.minutesGoal ?? null, openedOn: isoDate(), completedOn: "", inNotebook: false },
      undefined,
    );
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={`Open a challenge for ${nameOf(student)}`}>
      <p className="muted small">From the library rows the studio uses at Level Up {level}:</p>
      <ul className="list card">
        {templatesFor(level).map((t) => (
          <li key={t.code}>
            <button className="list-row" type="button" onClick={() => create(t)}>
              <span className="code">{t.code}</span>
              <span className="grow">{t.name}</span>
              <span className="muted small">{t.points}</span>
            </button>
          </li>
        ))}
      </ul>
      <h3>Or a custom one, inside the fifteen</h3>
      <div className="grid-3">
        <label className="field">
          <span>Code</span>
          <input className="input" value={code} placeholder={`CH ${level}b`} onChange={(e) => setCode(e.target.value)} />
        </label>
        <label className="field grow-2">
          <span>Name</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span>Points</span>
          <input className="input" type="number" step={10} min={40} max={150} value={points} onChange={(e) => setPoints(e.target.value)} />
        </label>
      </div>
      {code && !parsed && <p className="small bad-text">A code is two letters from the fifteen, the level digit and a letter, like CH 1b.</p>}
      {points && !validPoints(pts) && <p className="small bad-text">Between 40 and 150, in tens.</p>}
      <div className="sheet-actions">
        <button className="btn btn-primary btn-block" type="button" disabled={!valid} onClick={() => create({ code, name: name.trim(), points: pts })}>
          Open it
        </button>
      </div>
    </Sheet>
  );
}
