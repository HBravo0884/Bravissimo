import { useMemo, useState } from "react";
import { store, useDB } from "../data/store";
import { accuracy, bestKey, challengeMinutes, clearedRungs, inLastDays, mastery, minutesOf, pointsAtLevel, practiceStreak, sessionsOf, weakestItems } from "../data/stats";
import { BADGES, earnedBadges } from "../data/badges";
import { CATEGORIES, CATEGORY_BY_CODE, CHALLENGE_LIBRARY, formatChallengeCode, levelLabel, LEVELS, MAX_POINTS, MIN_POINTS, parseChallengeCode, POINTS_PER_LEVEL, validPointValue } from "../data/levelup";
import type { Challenge, GameId, ItemStat, Student } from "../data/model";
import { download, sessionsCsv, today } from "../data/exporters";
import { appUrl, encodePayload } from "../data/share";
import { GAMES, GAME_BY_ID, itemLabel, stageName, variantName } from "../games/registry";
import { FLASH_GAMES, NOTE_STAGES } from "../games/flash";
import { RHYTHM_LEVELS } from "../music/rhythm";
import { diatonicIndex, parsePitch } from "../music/pitch";
import { href, navigate } from "../router";
import { Avatar, BadgeGrid, formatMinutes, Icon, LevelBar, Progress, relativeDay, Segmented, Sheet, Stat } from "../components/ui";
import { LineChart } from "../components/charts";

type Tab = "overview" | "levelup" | "map" | "history" | "badges";

export function StudentDetail({ studentId }: { studentId: string }) {
  const db = useDB((d) => d);
  const student = db.students.find((s) => s.id === studentId);
  const [tab, setTab] = useState<Tab>("overview");
  const [editing, setEditing] = useState(false);
  const [linking, setLinking] = useState(false);

  const mine = useMemo(() => sessionsOf(db.sessions, studentId).sort((a, b) => a.startedAt.localeCompare(b.startedAt)), [db.sessions, studentId]);

  if (!student) {
    return (
      <div className="card empty stack">
        <h2>Student not found</h2>
        <a className="btn" href={href("/teacher")}>
          Back to the dashboard
        </a>
      </div>
    );
  }

  const streak = practiceStreak(mine);
  const last = mine[mine.length - 1];

  return (
    <div className="stack">
      <a className="btn btn-ghost btn-sm" href={href("/teacher")} style={{ alignSelf: "flex-start" }}>
        <Icon name="back" size={18} /> Dashboard
      </a>
      <div className="spread">
        <div className="row">
          <Avatar student={student} size={60} />
          <div>
            <h1>{student.name}</h1>
            <p className="muted small">
              {levelLabel(student.levelUp)}
              {student.playsForPoints ? "" : " · doesn't play for points"} · last played {relativeDay(last?.startedAt)}
              {streak.current ? ` · 🔥 ${streak.current}-day streak` : ""}
            </p>
          </div>
        </div>
        <div className="btn-row">
          <button className="btn btn-sm" type="button" onClick={() => setLinking(true)}>
            <Icon name="share" size={18} /> Home practice link
          </button>
          <button className="btn btn-sm" type="button" onClick={() => setEditing(true)}>
            Edit
          </button>
        </div>
      </div>

      <div className="tabs" role="tablist">
        {(
          [
            ["overview", "Progress"],
            ["levelup", "Level Up"],
            ["map", "Skills map"],
            ["history", "History"],
            ["badges", "Badges"],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button key={id} role="tab" type="button" aria-selected={tab === id} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {tab === "overview" && <Overview student={student} sessions={mine} />}
      {tab === "levelup" && <LevelUpPanel student={student} challenges={db.challenges.filter((c) => c.studentId === student.id)} />}
      {tab === "map" && <SkillsMap sessions={mine} />}
      {tab === "history" && <History studentId={student.id} />}
      {tab === "badges" && <BadgeGrid all={BADGES} earned={new Set(earnedBadges(mine).map((b) => b.id))} />}

      <EditStudentSheet open={editing} student={student} onClose={() => setEditing(false)} />
      <HomeLinkSheet open={linking} student={student} onClose={() => setLinking(false)} />
    </div>
  );
}

/* --------------------------------- overview --------------------------------- */

function Overview({ student, sessions }: { student: Student; sessions: ReturnType<typeof sessionsOf> }) {
  const played = GAMES.filter((g) => sessions.some((s) => s.game === g.id));
  const [game, setGame] = useState<GameId>(played[0]?.id ?? "notes");
  const [scoreGroup, setScoreGroup] = useState("");
  const week = inLastDays(sessions, 7);
  const last5 = sessions.slice(-5);
  const acc5 = last5.length ? Math.round((last5.reduce((a, s) => a + accuracy(s), 0) / last5.length) * 100) : null;
  const forGame = sessions.filter((s) => s.game === game);
  const weak = weakestItems(mastery(sessions, game), 5);

  if (!sessions.length) {
    return (
      <div className="card empty stack" style={{ alignItems: "center" }}>
        <h2>No games yet</h2>
        <p>
          When {student.name.split(" ")[0]} plays in the studio or sends scores from home, progress shows up here.
        </p>
      </div>
    );
  }

  const info = GAME_BY_ID[game];
  const color = `var(--s${info.slot})`;
  // Scores only compare within one stage + variant + format; default to the most-played one.
  const groups = [...new Set(forGame.map(bestKey))].map((k) => ({ k, n: forGame.filter((s) => bestKey(s) === k).length })).sort((a, b) => b.n - a.n);
  const group = groups.find((g) => g.k === scoreGroup)?.k ?? groups[0]?.k;
  const inGroup = forGame.filter((s) => bestKey(s) === group);
  const groupLabel = (k: string) => {
    const s = forGame.find((x) => bestKey(x) === k)!;
    return `${stageName(s.game, s.stage)} · ${variantName(s.game, s.variant)}${s.game === "rhythm" ? "" : ` · ${s.format}`}`;
  };
  const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

  return (
    <div className="stack">
      <div className="kpis">
        <Stat k="Games played" v={sessions.length} />
        <Stat k="Minutes this week" v={Math.round(minutesOf(week))} sub={`${week.length} games`} />
        <Stat k="Accuracy, last 5" v={acc5 === null ? "—" : `${acc5}%`} />
        <Stat k="Longest streak" v={practiceStreak(sessions).longest} sub="days" />
      </div>

      <div className="card pad stack">
        <div className="spread">
          <h3>{info.name} accuracy over time</h3>
          <Segmented label="Game" value={game} onChange={(g) => (setGame(g), setScoreGroup(""))} options={(played.length ? played : GAMES).map((g) => ({ id: g.id, label: g.name }))} />
        </div>
        <LineChart
          label={`${info.name} accuracy`}
          color={color}
          yMax={100}
          yFormat={(v) => `${Math.round(v)}%`}
          height={200}
          points={forGame.map((s) => ({
            t: new Date(s.startedAt).getTime(),
            y: Math.round(accuracy(s) * 100),
            tip: [`${Math.round(accuracy(s) * 100)}% right`, when(s.startedAt), `${stageName(s.game, s.stage)} · ${variantName(s.game, s.variant)}`, `${s.correct}/${s.attempts}`],
          }))}
        />
      </div>

      {group && (
        <div className="card pad stack">
          <div className="spread">
            <h3>{info.name} score over time</h3>
            {groups.length > 1 && (
              <select className="input" style={{ width: "auto" }} value={group} onChange={(e) => setScoreGroup(e.target.value)} aria-label="Which setting">
                {groups.map((g) => (
                  <option key={g.k} value={g.k}>
                    {groupLabel(g.k)} ({g.n})
                  </option>
                ))}
              </select>
            )}
          </div>
          <LineChart
            label={`${info.name} scores, ${groupLabel(group)}`}
            color={color}
            points={inGroup.map((s) => ({
              t: new Date(s.startedAt).getTime(),
              y: s.score,
              tip: [`${s.score} points`, when(s.startedAt), `${s.correct}/${s.attempts} right (${Math.round(accuracy(s) * 100)}%)`],
            }))}
          />
          <p className="tiny muted">Only {groupLabel(group)} games, so every point compares like with like.</p>
        </div>
      )}

      <div className="card pad stack-sm">
        <h3>Needs work in {info.name}</h3>
        {weak.length ? (
          <div className="row-wrap">
            {weak.map((w) => (
              <span key={w.item} className="pill pill-bad">
                {itemLabel(game, w.item)} · {Math.round(w.accuracy * 100)}% of {w.attempts}
              </span>
            ))}
          </div>
        ) : (
          <p className="muted small">Nothing below 90% with enough attempts to judge. The games already serve weak spots more often.</p>
        )}
      </div>
    </div>
  );
}

/* --------------------------------- skills map --------------------------------- */

function tone(stat: ItemStat | undefined): { cls: string; style: React.CSSProperties; text: string } {
  if (!stat || stat[1] === 0) return { cls: "mtile unseen", style: {}, text: "new" };
  const p = stat[0] / stat[1];
  const step = p >= 0.95 ? 4 : p >= 0.85 ? 3 : p >= 0.7 ? 2 : p >= 0.5 ? 1 : 0;
  const darkText = step <= 1;
  return {
    cls: "mtile",
    style: { background: `var(--m${step})`, color: darkText ? "#0b1f3a" : "#fff", borderColor: "transparent" },
    text: `${Math.round(p * 100)}%`,
  };
}

function Tiles({ items, stats, label }: { items: string[]; stats: Record<string, ItemStat>; label: (i: string) => string }) {
  return (
    <div className="mastery">
      {items.map((i) => {
        const t = tone(stats[i]);
        return (
          <div key={i} className={t.cls} style={t.style} title={stats[i] ? `${stats[i][0]} of ${stats[i][1]} right` : "Not seen yet"}>
            {label(i)}
            <small>{t.text}</small>
          </div>
        );
      })}
    </div>
  );
}

function SkillsMap({ sessions }: { sessions: ReturnType<typeof sessionsOf> }) {
  const notes = mastery(sessions, "notes");
  const all = (clef: "treble" | "bass") =>
    [...new Set(NOTE_STAGES.flatMap((s) => s[clef]))].sort((a, b) => diatonicIndex(parsePitch(b)) - diatonicIndex(parsePitch(a))).map((n) => `${clef}:${n}`);
  const cleared = clearedRungs(sessions);
  const rhythm = mastery(sessions, "rhythm");
  const rungStat = (i: number): ItemStat | undefined => {
    const parts = ["match", "read", "echo"].map((m) => rhythm[`rung:${i}:${m}`]).filter(Boolean) as ItemStat[];
    return parts.length ? parts.reduce((a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], [0, 0, 0] as ItemStat) : undefined;
  };

  return (
    <div className="stack">
      <div className="legend" aria-label="Legend">
        Accuracy:
        {[
          ["new", null],
          ["<50%", 0],
          ["50%", 1],
          ["70%", 2],
          ["85%", 3],
          ["95%+", 4],
        ].map(([l, step]) => (
          <span key={String(l)} className="row" style={{ gap: 4 }}>
            <span className="chip" style={step === null ? { border: "1px dashed var(--line-2)" } : { background: `var(--m${step})` }} />
            {l}
          </span>
        ))}
      </div>
      <div className="card pad stack-sm">
        <h3>Note Rush · treble clef</h3>
        <Tiles items={all("treble")} stats={notes} label={(i) => i.split(":")[1]} />
      </div>
      <div className="card pad stack-sm">
        <h3>Note Rush · bass clef</h3>
        <Tiles items={all("bass")} stats={notes} label={(i) => i.split(":")[1]} />
      </div>
      <div className="card pad stack-sm">
        <h3>Interval Detective</h3>
        <Tiles items={FLASH_GAMES.intervals.pool(2, "treble")} stats={mastery(sessions, "intervals")} label={(i) => FLASH_GAMES.intervals.itemLabel(i)} />
      </div>
      <div className="card pad stack-sm">
        <h3>Key Signatures</h3>
        <Tiles items={FLASH_GAMES.keys.pool(2, "treble")} stats={mastery(sessions, "keys")} label={(i) => FLASH_GAMES.keys.itemLabel(i).replace(" major", "")} />
      </div>
      <div className="card pad stack-sm">
        <h3>Rhythm Ladder</h3>
        <div className="mastery" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))" }}>
          {RHYTHM_LEVELS.map((l, i) => {
            const t = tone(rungStat(i));
            return (
              <div key={i} className={t.cls} style={t.style}>
                {l.name}
                <small>
                  {t.text}
                  {cleared.has(i) ? " · cleared ✓" : ""}
                </small>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------- history ---------------------------------- */

function History({ studentId }: { studentId: string }) {
  const db = useDB((d) => d);
  const rows = db.sessions.filter((s) => s.studentId === studentId).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const [limit, setLimit] = useState(30);
  const student = db.students.find((s) => s.id === studentId)!;

  if (!rows.length) return <div className="card empty">No games yet.</div>;

  return (
    <div className="card pad stack">
      <div className="spread">
        <h3>{rows.length} games</h3>
        <button className="btn btn-sm" type="button" onClick={() => download(`${student.name.replace(/\s+/g, "-")}-scores-${today()}.csv`, sessionsCsv(db, studentId), "text/csv")}>
          Export CSV
        </button>
      </div>
      <div className="table-wrap">
        <table className="data cards">
          <thead>
            <tr>
              <th>When</th>
              <th>Game</th>
              <th className="r">Score</th>
              <th className="r">Right</th>
              <th className="r">Streak</th>
              <th className="r">Time</th>
              <th>Where</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, limit).map((s) => (
              <tr key={s.id}>
                <td data-label="When">{new Date(s.startedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</td>
                <td data-label="Game" className="wide">
                  <span className="row" style={{ gap: 8 }}>
                    <span className="swatch" style={{ background: `var(--s${GAME_BY_ID[s.game].slot})` }} />
                    <span>
                      {GAME_BY_ID[s.game].name}
                      <span className="tiny muted" style={{ display: "block" }}>
                        {stageName(s.game, s.stage)} · {variantName(s.game, s.variant)} · {s.format}
                      </span>
                    </span>
                  </span>
                </td>
                <td data-label="Score" className="r">
                  {s.score}
                </td>
                <td data-label="Right" className="r">
                  {s.correct}/{s.attempts} ({Math.round(accuracy(s) * 100)}%)
                </td>
                <td data-label="Best streak" className="r">
                  {s.bestStreak}
                </td>
                <td data-label="Time" className="r">
                  {formatMinutes(s.durationMs / 60000)}
                </td>
                <td data-label="Where">{s.device ?? "—"}</td>
                <td>
                  <button
                    className="btn btn-ghost btn-sm btn-danger"
                    type="button"
                    aria-label="Delete this game"
                    onClick={() => {
                      if (confirm("Delete this game from the records?")) store.deleteSession(s.id);
                    }}
                  >
                    <Icon name="close" size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > limit && (
        <button className="btn" type="button" onClick={() => setLimit((l) => l + 50)}>
          Show more
        </button>
      )}
    </div>
  );
}

/* ---------------------------------- Level Up ---------------------------------- */

function LevelUpPanel({ student, challenges }: { student: Student; challenges: Challenge[] }) {
  const db = useDB((d) => d);
  const [assigning, setAssigning] = useState(false);
  const points = pointsAtLevel(student, db.challenges);
  const active = challenges.filter((c) => !c.completedAt).sort((a, b) => a.assignedAt.localeCompare(b.assignedAt));
  const done = challenges.filter((c) => c.completedAt).sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));

  return (
    <div className="stack">
      <div className="card pad stack">
        <div className="spread">
          <div>
            <h3>{levelLabel(student.levelUp)}</h3>
            <p className="muted small">
              {student.playsForPoints ? (
                <>
                  <span className="num">{points.toLocaleString()}</span> of {POINTS_PER_LEVEL.toLocaleString()} points
                  {student.pointsCarried ? ` (${student.pointsCarried} from the notebook)` : ""}
                </>
              ) : (
                "Doesn't play for points: challenges are tracked without values on the student's side."
              )}
            </p>
          </div>
          {points >= POINTS_PER_LEVEL && student.levelUp < LEVELS && (
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => {
                if (confirm(`Move ${student.name} up to ${levelLabel(student.levelUp + 1)}? ${points - POINTS_PER_LEVEL} extra points carry over.`)) store.levelUp(student.id, points);
              }}
            >
              Level up to {student.levelUp + 1}
            </button>
          )}
        </div>
        <LevelBar points={points} />
        <p className="tiny muted">Points land once, when a challenge is finished. Games carry no point value of their own; their minutes feed the challenges they're linked to.</p>
      </div>

      <div className="card pad stack-sm">
        <div className="spread">
          <h3>Active challenges</h3>
          <button className="btn btn-primary btn-sm" type="button" onClick={() => setAssigning(true)}>
            <Icon name="plus" size={18} /> Assign
          </button>
        </div>
        {active.length === 0 && <p className="muted small">No active challenges. Studio rule: every student has a current song and an active points challenge.</p>}
        {active.map((c) => (
          <ChallengeRow key={c.id} c={c} />
        ))}
      </div>

      {done.length > 0 && (
        <div className="card pad stack-sm">
          <h3>Completed</h3>
          {done.map((c) => (
            <ChallengeRow key={c.id} c={c} />
          ))}
        </div>
      )}

      <AssignSheet open={assigning} student={student} onClose={() => setAssigning(false)} />
    </div>
  );
}

function ChallengeRow({ c }: { c: Challenge }) {
  const db = useDB((d) => d);
  const mins = challengeMinutes(c, db.sessions);
  const cat = CATEGORY_BY_CODE[parseChallengeCode(c.code)?.category ?? ""];
  return (
    <div className="challenge">
      <span className={`pill ${c.completedAt ? "pill-good" : "pill-accent"} code`} title={cat?.name}>
        {c.code}
      </span>
      <div className="grow stack-sm" style={{ gap: 4 }}>
        <span>
          {c.title} <span className="muted small num">· {c.points} pts</span>
        </span>
        {c.minutes && !c.completedAt && (
          <>
            <Progress value={mins} max={c.minutes} tone={mins >= c.minutes ? "good" : undefined} label={`${c.code} minutes`} />
            <span className="tiny muted num">
              {formatMinutes(mins)} of {c.minutes} min in {c.feeds?.map((g) => GAME_BY_ID[g].name).join(", ")}
            </span>
          </>
        )}
        <span className="tiny muted">
          {c.completedAt ? `Finished ${relativeDay(c.completedAt)} at ${levelLabel(c.completedAtLevel ?? 1)}` : `Assigned ${relativeDay(c.assignedAt)}`}
        </span>
      </div>
      <div className="actions btn-row">
        {c.completedAt ? (
          <button className="btn btn-sm btn-ghost" type="button" onClick={() => store.reopenChallenge(c.id)}>
            Reopen
          </button>
        ) : (
          <button className="btn btn-sm btn-primary" type="button" onClick={() => store.completeChallenge(c.id)}>
            <Icon name="check" size={18} /> Done
          </button>
        )}
        <button
          className="btn btn-sm btn-ghost btn-danger"
          type="button"
          aria-label={`Remove ${c.code}`}
          onClick={() => {
            if (confirm(`Remove ${c.code}?`)) store.deleteChallenge(c.id);
          }}
        >
          <Icon name="close" size={16} />
        </button>
      </div>
    </div>
  );
}

function AssignSheet({ open, student, onClose }: { open: boolean; student: Student; onClose: () => void }) {
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [points, setPoints] = useState(100);
  const [minutes, setMinutes] = useState<number | "">("");
  const [feeds, setFeeds] = useState<GameId[]>([]);

  const parsed = parseChallengeCode(code);
  const valid = !!parsed && title.trim() && validPointValue(points) && (minutes === "" || (minutes > 0 && feeds.length > 0));

  const fromLibrary = (i: number) => {
    const c = CHALLENGE_LIBRARY[i];
    setCode(c.code);
    setTitle(c.title);
    setPoints(c.points);
    setMinutes(c.minutes ?? "");
    setFeeds(c.minutes ? (["rhythm", "intervals"] as GameId[]) : []);
  };

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    store.addChallenge({
      studentId: student.id,
      code: formatChallengeCode(code),
      title: title.trim(),
      points,
      ...(minutes !== "" ? { minutes, feeds } : {}),
    });
    setCode("");
    setTitle("");
    setMinutes("");
    setFeeds([]);
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={`Assign a challenge to ${student.name.split(" ")[0]}`}>
      <form className="stack" onSubmit={save}>
        <label className="field">
          <span>From the library</span>
          <select className="input" value="" onChange={(e) => e.target.value !== "" && fromLibrary(Number(e.target.value))}>
            <option value="">Pick a priced challenge…</option>
            {CHALLENGE_LIBRARY.map((c, i) => (
              <option key={c.code} value={i}>
                {c.code} · {c.title} · {c.points}
              </option>
            ))}
          </select>
        </label>
        <div className="row-wrap">
          <label className="field" style={{ flex: "1 1 120px" }}>
            <span>Code</span>
            <input className="input code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="ET 1b" autoComplete="off" list="lu-categories" />
          </label>
          <label className="field" style={{ flex: "1 1 120px" }}>
            <span>Points</span>
            <input className="input num" type="number" min={MIN_POINTS} max={MAX_POINTS} step={10} value={points} onChange={(e) => setPoints(Number(e.target.value))} />
          </label>
        </div>
        <datalist id="lu-categories">
          {CATEGORIES.map((c) => (
            <option key={c.code} value={`${c.code} ${student.levelUp}a`}>
              {c.name}
            </option>
          ))}
        </datalist>
        <p className="tiny muted">
          {code && !parsed
            ? "Codes look like ET 1b: category, level, item letter."
            : parsed
              ? `${CATEGORY_BY_CODE[parsed.category].name} · ${levelLabel(parsed.level)} · item ${parsed.item}`
              : `Categories: ${CATEGORIES.map((c) => c.code).join(" ")}`}
          {!validPointValue(points) && ` · Points run ${MIN_POINTS}–${MAX_POINTS} in tens.`}
        </p>
        <label className="field">
          <span>Challenge</span>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What finishing looks like" />
        </label>
        <label className="field">
          <span>Minutes in Bravissimo that count (optional)</span>
          <input className="input num" type="number" min={1} step={5} value={minutes} onChange={(e) => setMinutes(e.target.value === "" ? "" : Number(e.target.value))} placeholder="e.g. 250 for ET 1b" />
        </label>
        {minutes !== "" && (
          <div className="row-wrap" role="group" aria-label="Games that count">
            {GAMES.map((g) => (
              <label key={g.id} className="check" style={{ marginRight: 8 }}>
                <input type="checkbox" checked={feeds.includes(g.id)} onChange={(e) => setFeeds((f) => (e.target.checked ? [...f, g.id] : f.filter((x) => x !== g.id)))} />
                <span>{g.name}</span>
              </label>
            ))}
          </div>
        )}
        <button className="btn btn-primary" type="submit" disabled={!valid}>
          Assign
        </button>
      </form>
    </Sheet>
  );
}

/* ------------------------------ edit & home link ------------------------------ */

function EditStudentSheet({ open, student, onClose }: { open: boolean; student: Student; onClose: () => void }) {
  const [name, setName] = useState(student.name);
  const [level, setLevel] = useState(student.levelUp);
  const [carried, setCarried] = useState(student.pointsCarried);
  const [points, setPoints] = useState(student.playsForPoints);
  const [color, setColor] = useState(student.color);

  return (
    <Sheet open={open} onClose={onClose} title="Edit student">
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          store.updateStudent(student.id, { name: name.trim() || student.name, levelUp: level, pointsCarried: Math.max(0, carried), playsForPoints: points, color });
          onClose();
        }}
      >
        <label className="field">
          <span>Name</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="row-wrap" role="radiogroup" aria-label="Color">
          {Array.from({ length: 8 }, (_, i) => (
            <button key={i} type="button" aria-pressed={color === i} onClick={() => setColor(i)} className="btn btn-sm" style={{ minWidth: 44, padding: 0, borderColor: color === i ? "var(--accent)" : undefined }} aria-label={`Color ${i + 1}`}>
              <Avatar student={{ name, color: i }} size={30} />
            </button>
          ))}
        </div>
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
            <span>Notebook points this level</span>
            <input className="input num" type="number" min={0} step={10} value={carried} onChange={(e) => setCarried(Number(e.target.value) || 0)} />
          </label>
        </div>
        <label className="check">
          <input type="checkbox" checked={points} onChange={(e) => setPoints(e.target.checked)} />
          <span>Plays for points</span>
        </label>
        <button className="btn btn-primary" type="submit">
          Save
        </button>
        <button
          className="btn btn-danger"
          type="button"
          onClick={() => {
            if (confirm(`Delete ${student.name} and all of their scores from this device? This can't be undone.`)) {
              store.deleteStudent(student.id);
              navigate("/teacher");
            }
          }}
        >
          Delete student
        </button>
      </form>
    </Sheet>
  );
}

function HomeLinkSheet({ open, student, onClose }: { open: boolean; student: Student; onClose: () => void }) {
  const db = useDB((d) => d);
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);

  const build = async () => {
    const code = await encodePayload({
      kind: "join",
      v: 1,
      student: { id: student.id, name: student.name, color: student.color, levelUp: student.levelUp, playsForPoints: student.playsForPoints },
      studio: db.settings.studioName,
      teacher: db.settings.teacherName,
      challenges: db.challenges.filter((c) => c.studentId === student.id && !c.completedAt && c.minutes),
    });
    setLink(appUrl(`/join/${code}`));
  };

  return (
    <Sheet
      open={open}
      onClose={() => {
        setLink("");
        setCopied(false);
        onClose();
      }}
      title="Home practice link"
    >
      <p className="muted">
        Send this to {student.name.split(" ")[0]}'s family. Opening it on their tablet or computer sets that device up for {student.name.split(" ")[0]} alone. When they tap <b>Send scores</b>, you get a link back that adds their games here.
      </p>
      {!link ? (
        <button className="btn btn-primary" type="button" onClick={build}>
          Make the link
        </button>
      ) : (
        <>
          <div className="link-box">
            <input className="input" readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Home practice link" />
          </div>
          <button
            className="btn"
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(link);
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            {copied ? "Copied" : "Copy link"}
          </button>
        </>
      )}
      <p className="tiny muted">Linked challenges travel with the link so their progress bars show at home. Recreate the link after assigning new minute-based challenges.</p>
    </Sheet>
  );
}
