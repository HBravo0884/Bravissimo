import { useMemo, useState } from "react";
import { store, useDB } from "../data/store";
import { accuracy, inLastDays, minutesOf, pointsAtLevel, practiceStreak, sessionsOf, studentSignals, type Signal } from "../data/stats";
import { download, sessionsCsv, today } from "../data/exporters";
import { levelLabel, LEVELS, POINTS_PER_LEVEL } from "../data/levelup";
import { href, navigate } from "../router";
import { Avatar, Icon, relativeDay, Segmented, Sheet, Stat } from "../components/ui";
import { Sparkline } from "../components/charts";

type Filter = "all" | "attention" | "celebrate";
type Sort = "name" | "recent" | "streak" | "level";

const SIGNAL_TONE: Record<Signal["kind"], string> = {
  quiet: "pill-warn",
  dip: "pill-bad",
  best: "pill-good",
  ready: "pill-accent",
  minutes: "pill-accent",
};

export function Teacher() {
  const db = useDB((d) => d);
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("recent");
  const [adding, setAdding] = useState(false);

  const rows = useMemo(() => {
    return db.students
      .filter((s) => !s.archived)
      .map((s) => {
        const mine = sessionsOf(db.sessions, s.id).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
        const week = inLastDays(mine, 7);
        return {
          student: s,
          last: mine[mine.length - 1]?.startedAt,
          week: week.length,
          minutes: minutesOf(week),
          streak: practiceStreak(mine).current,
          trend: mine.slice(-10).map((x) => accuracy(x)),
          signals: studentSignals(s, db.sessions, db.challenges),
          points: pointsAtLevel(s, db.challenges),
        };
      });
  }, [db]);

  const shown = rows
    .filter((r) =>
      filter === "attention" ? r.signals.some((x) => x.kind === "quiet" || x.kind === "dip") || !r.last : filter === "celebrate" ? r.signals.some((x) => x.kind === "best" || x.kind === "ready" || x.kind === "minutes") : true,
    )
    .sort((a, b) =>
      sort === "name"
        ? a.student.name.localeCompare(b.student.name)
        : sort === "streak"
          ? b.streak - a.streak
          : sort === "level"
            ? b.student.levelUp - a.student.levelUp || b.points - a.points
            : (b.last ?? "").localeCompare(a.last ?? ""),
    );

  const week = inLastDays(db.sessions, 7);
  const active = new Set(week.map((s) => s.studentId)).size;
  const weekAcc = week.length ? Math.round((week.reduce((a, s) => a + s.correct, 0) / Math.max(1, week.reduce((a, s) => a + s.attempts, 0))) * 100) : 0;
  const attention = rows.filter((r) => r.signals.some((x) => x.kind === "quiet" || x.kind === "dip") || !r.last).length;

  return (
    <div className="stack">
      <div className="spread">
        <div>
          <span className="eyebrow">{db.settings.studioName}</span>
          <h1>Teacher dashboard</h1>
        </div>
        <div className="btn-row">
          <button className="btn btn-primary" type="button" onClick={() => setAdding(true)}>
            <Icon name="plus" size={18} /> Add student
          </button>
          <button className="btn" type="button" onClick={() => download(`bravissimo-scores-${today()}.csv`, sessionsCsv(db), "text/csv")} disabled={!db.sessions.length}>
            Export CSV
          </button>
        </div>
      </div>

      <div className="kpis">
        <Stat k="Practiced this week" v={active} sub={`of ${rows.length}`} />
        <Stat k="Games this week" v={week.length} />
        <Stat k="Minutes this week" v={Math.round(minutesOf(week))} />
        <Stat k="Accuracy this week" v={week.length ? `${weekAcc}%` : "—"} />
      </div>

      <div className="spread">
        <Segmented
          label="Show"
          value={filter}
          onChange={setFilter}
          options={[
            { id: "all", label: `All ${rows.length}` },
            { id: "attention", label: `Check in · ${attention}` },
            { id: "celebrate", label: "Celebrate" },
          ]}
        />
        <label className="row small muted">
          Sort
          <select className="input" style={{ width: "auto", minHeight: 44 }} value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="recent">Last played</option>
            <option value="name">Name</option>
            <option value="streak">Streak</option>
            <option value="level">Level Up</option>
          </select>
        </label>
      </div>

      <div className="card roster">
        {rows.length === 0 ? (
          <div className="empty stack" style={{ alignItems: "center" }}>
            <h2>Add your first student</h2>
            <p>Each student gets their own scores, streaks and Level Up challenges. Names stay on this device.</p>
            <button className="btn btn-primary" type="button" onClick={() => setAdding(true)}>
              <Icon name="plus" size={18} /> Add student
            </button>
          </div>
        ) : (
          <>
            <div className="roster-row roster-head" aria-hidden="true">
              <span>Student</span>
              <span>Streak</span>
              <span>Last played</span>
              <span>Notes</span>
              <span>Accuracy, last 10</span>
            </div>
            {shown.map((r) => (
              <a key={r.student.id} className="roster-row" href={href(`/teacher/${r.student.id}`)}>
                <span className="who-cell">
                  <Avatar student={r.student} />
                  <span style={{ minWidth: 0 }}>
                    <b>{r.student.name}</b>
                    <span className="tiny muted">
                      {r.student.playsForPoints ? `${levelLabel(r.student.levelUp)} · ${r.points.toLocaleString()} / ${POINTS_PER_LEVEL.toLocaleString()}` : `${levelLabel(r.student.levelUp)} · no points`}
                    </span>
                  </span>
                </span>
                <span className="c-streak num">{r.streak ? `🔥 ${r.streak}` : "—"}</span>
                <span className="c-last small">{relativeDay(r.last)}</span>
                <span className="c-facts small muted">
                  <span>{r.streak ? `🔥 ${r.streak}-day streak` : "No streak"}</span>
                  <span>Last played {relativeDay(r.last)}</span>
                  <span>{r.week} this week</span>
                </span>
                <span className="c-signals signals">
                  {!r.last && <span className="pill pill-warn">Hasn't played yet</span>}
                  {r.signals.map((x, i) => (
                    <span key={i} className={`pill ${SIGNAL_TONE[x.kind]}`}>
                      {x.text}
                    </span>
                  ))}
                </span>
                <span className="c-spark">
                  <Sparkline values={r.trend} label={`Accuracy over the last ${r.trend.length} games`} />
                </span>
              </a>
            ))}
            {shown.length === 0 && <div className="empty small">Nobody in this view right now.</div>}
          </>
        )}
      </div>

      <AddStudentSheet open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}

export function AddStudentSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState("");
  const [level, setLevel] = useState(1);
  const [carried, setCarried] = useState(0);
  const [points, setPoints] = useState(true);
  const [again, setAgain] = useState(false);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const s = store.addStudent({ name, levelUp: level, pointsCarried: carried, playsForPoints: points });
    setName("");
    setCarried(0);
    if (again) return;
    onClose();
    navigate(`/teacher/${s.id}`);
  };

  return (
    <Sheet open={open} onClose={onClose} title="Add a student">
      <form className="stack" onSubmit={save}>
        <label className="field">
          <span>Name</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus autoComplete="off" placeholder="First name and last initial is plenty" />
        </label>
        <div className="row-wrap">
          <label className="field grow">
            <span>Level Up level</span>
            <select className="input" value={level} onChange={(e) => setLevel(Number(e.target.value))}>
              {Array.from({ length: LEVELS }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {levelLabel(i + 1)}
                </option>
              ))}
            </select>
          </label>
          <label className="field grow">
            <span>Points already earned this level</span>
            <input className="input num" type="number" inputMode="numeric" min={0} max={POINTS_PER_LEVEL} step={10} value={carried} onChange={(e) => setCarried(Number(e.target.value) || 0)} />
          </label>
        </div>
        <label className="check">
          <input type="checkbox" checked={points} onChange={(e) => setPoints(e.target.checked)} />
          <span>Plays for points (untick for students who'd rather not be graded)</span>
        </label>
        <label className="check">
          <input type="checkbox" checked={again} onChange={(e) => setAgain(e.target.checked)} />
          <span>Add another after this one</span>
        </label>
        <button className="btn btn-primary" type="submit" disabled={!name.trim()}>
          Add student
        </button>
      </form>
    </Sheet>
  );
}
