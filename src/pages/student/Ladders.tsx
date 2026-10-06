import { useMemo, useState } from "react";
import { store, useData } from "../../data/store";
import { nameOf } from "../../data/select";
import { extraCreditComplete, ladderRungs, readyRungs, rungStates, skillLabel, skillResults, skillsCheckComplete, type RungState } from "../../../shared/ladders";
import { parseChallengeCode } from "../../../shared/levelup";
import { isoDate } from "../../../shared/dates";
import { Empty } from "../../components/ui";
import type { Progress, Rung, Student } from "../../../shared/types";

const LADDER_NAMES: Record<string, string> = { R: "Ear and rhythm (R)", T: "Theory book (T)", Subdivide: "Subdivide" };

export function recordRung(student: Student, rung: string, state: RungState, note = "") {
  const p: Omit<Progress, "id"> = { student: student.id, rung, kind: "rung", state, item: null, promptSet: "", mark: "Verified", date: isoDate(), source: "lesson", note };
  store.create("progress", p, `${nameOf(student)}, ${rung} ${state}`);
}

export function Ladders({ student }: { student: Student }) {
  const rungs = useData("rungs");
  const progress = useData("progress");
  const skills = useData("skills");
  const states = useMemo(() => rungStates(progress, student.id), [progress, student.id]);
  const ladders = [...new Set(rungs.map((r) => r.ladder))].sort((a, b) => ["R", "T"].indexOf(a) - ["R", "T"].indexOf(b));

  if (!rungs.length)
    return (
      <Empty>
        The ladders come from the Rungs database in Notion (the R ladder, the theory book and Subdivide). Once it has rows, each student's place on them shows here.
      </Empty>
    );

  const skillRungs = [...new Set(skills.map((s) => s.rung))];
  const currentT = [...states.values()].find((s) => s.state === "current" && skillRungs.includes(s.rung))?.rung ?? skillRungs[0] ?? "";

  return (
    <div className="stack">
      <p className="muted small">A student can sit on both ladders at once; that is normal. The family sees only the current sheet, the one before and the next.</p>
      {ladders.map((l) => (
        <LadderCard key={l} student={student} ladder={l} rungs={ladderRungs(rungs, l)} states={states} />
      ))}
      {skillRungs.length > 0 && <SkillsCheck student={student} initial={currentT} rungs={rungs} />}
    </div>
  );
}

function LadderCard({ student, ladder, rungs, states }: { student: Student; ladder: string; rungs: Rung[]; states: ReturnType<typeof rungStates> }) {
  const [all, setAll] = useState(false);
  const ready = new Set(readyRungs(rungs, states, ladder).map((r) => r.code));
  const shown = all ? rungs : rungs.filter((r) => states.has(r.code) || ready.has(r.code));
  return (
    <section className="card pad stack-sm">
      <div className="spread">
        <h2>{LADDER_NAMES[ladder] ?? ladder}</h2>
        <button className="btn btn-sm btn-ghost" type="button" onClick={() => setAll(!all)}>
          {all ? "Show where they are" : `Show all ${rungs.length}`}
        </button>
      </div>
      {shown.length === 0 && <p className="muted small">Not started. Show all to pick a first rung.</p>}
      <ul className="rungs">
        {shown.map((r) => {
          const s = states.get(r.code);
          const state = s?.state ?? "not started";
          return (
            <li key={r.code} className={`rung ${state.replace(" ", "-")}`}>
              <div className="grow">
                <div className="row-wrap">
                  <b className="code">{r.code}</b>
                  <span>{r.title}</span>
                  {state !== "not started" && <span className={`pill ${state === "cleared" ? "pill-good" : state === "current" ? "pill-accent" : "pill-warn"}`}>{state}</span>}
                  {ready.has(r.code) && <span className="pill">ready</span>}
                </div>
                {r.doneWhen && <p className="small muted">Done when: {r.doneWhen}</p>}
                {r.needs.length > 0 && <p className="tiny muted">Needs {r.needs.join(", ")}</p>}
                {s?.clearedOn && <p className="tiny muted">Cleared {s.clearedOn}</p>}
              </div>
              <div className="btn-row">
                {state !== "current" && (
                  <button className="btn btn-sm" type="button" onClick={() => recordRung(student, r.code, "current")}>
                    Hand it over
                  </button>
                )}
                {state !== "cleared" && (
                  <button className="btn btn-sm btn-primary" type="button" onClick={() => recordRung(student, r.code, "cleared")}>
                    Cleared
                  </button>
                )}
                {state === "cleared" && (
                  <button className="btn btn-sm btn-ghost" type="button" onClick={() => recordRung(student, r.code, "needs recheck")}>
                    Recheck
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function SkillsCheck({ student, initial, rungs }: { student: Student; initial: string; rungs: Rung[] }) {
  const skills = useData("skills");
  const progress = useData("progress");
  const challenges = useData("challenges");
  const options = [...new Set(skills.map((s) => s.rung))].sort();
  const [rung, setRung] = useState(initial);
  const results = skillResults(progress, skills, student.id, rung);
  const complete = skillsCheckComplete(results);
  const extraDone = extraCreditComplete(results);
  const title = rungs.find((r) => r.code === rung)?.title ?? "";
  const credited = challenges.some((c) => c.student === student.id && c.name === `Skills Check ${rung}`);
  const extraCredited = challenges.some((c) => c.student === student.id && c.name === `Extra Credit ${rung}`);
  const credit = (name: string, points: number, criterion: string) => {
    const level = Number(student.levelUp) || 1;
    const used = new Set(challenges.filter((c) => c.student === student.id).map((c) => parseChallengeCode(c.code)?.item ?? ""));
    const letter = "abcdefghijklmnopqrstuvwxyz".split("").find((x) => !used.has(x)) ?? "z";
    store.create("challenges", { student: student.id, name, code: `TH ${level}${letter}`, points, state: "complete", criterion, blocks: 10, minutesGoal: null, openedOn: isoDate(), completedOn: isoDate(), inNotebook: false });
  };

  const record = (n: number, state: "Passed" | "Practice", promptSet: "A" | "B") => {
    store.create(
      "progress",
      { student: student.id, rung, kind: "skill", state, item: n, promptSet, mark: "Verified", date: isoDate(), source: "lesson", note: "" },
      `${nameOf(student)}, ${rung} skill ${n} ${state}`,
    );
  };

  return (
    <section className="card pad stack-sm">
      <div className="spread">
        <h2>Skills Check</h2>
        <select className="input input-inline" value={rung} onChange={(e) => setRung(e.target.value)} aria-label="Sheet">
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </div>
      <p className="muted small">
        {title ? `${rung} ${title}. ` : ""}Tested live, one box per skill. A miss is retested next week with the second prompt set; the others stay checked.
      </p>
      <ul className="skills">
        {results.map(({ item, latest, passed, retest }) => {
          const set: "A" | "B" = retest ? "B" : "A";
          return (
            <li key={item.id} className={passed ? "passed" : retest ? "retest" : ""}>
              <div className="grow">
                <div className="row-wrap">
                  <b>
                    {skillLabel(item)}. {item.skill}
                  </b>
                  {passed && <span className="pill pill-good">Passed {latest?.date}</span>}
                  {retest && <span className="pill pill-warn">Retest with prompt set B</span>}
                </div>
                <p className="small muted">
                  {item.show}
                  {item.pass ? ` Pass: ${item.pass}.` : ""}
                </p>
                <p className="small">
                  Prompt {set}: {set === "B" ? item.promptB || item.promptA : item.promptA}
                </p>
                {item.wrongMeans && <p className="tiny muted">A wrong answer usually means: {item.wrongMeans}</p>}
              </div>
              <div className="btn-row">
                <button className="btn btn-sm btn-primary" type="button" onClick={() => record(item.n, "Passed", set)}>
                  Passed
                </button>
                <button className="btn btn-sm" type="button" onClick={() => record(item.n, "Practice", set)}>
                  Practice
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {complete && student.pointsMode === "plays for points" && !credited && (
        <div className="banner good">
          <p>Every box passed. That earns this sheet's Theory challenge, 60 points, once.</p>
          <button className="btn btn-sm btn-primary" type="button" onClick={() => credit(`Skills Check ${rung}`, 60, "Every box on the Skills Check passed, tested live.")}>
            Credit it
          </button>
        </div>
      )}
      {complete && credited && <p className="small">Skills Check credited.</p>}
      {extraDone && student.pointsMode === "plays for points" && !extraCredited && (
        <div className="banner good">
          <p>Every Extra Credit box passed: a second Theory challenge, 40 points.</p>
          <button className="btn btn-sm btn-primary" type="button" onClick={() => credit(`Extra Credit ${rung}`, 40, "Every Extra Credit box passed, tested live.")}>
            Credit it
          </button>
        </div>
      )}
    </section>
  );
}
