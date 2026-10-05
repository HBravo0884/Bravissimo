import { useMemo, useState } from "react";
import { useDB } from "../data/store";
import { challengeMinutes, clearedRungs, inLastDays, minutesOf, practiceStreak, sessionsOf } from "../data/stats";
import { BADGES, earnedBadges } from "../data/badges";
import type { GameId } from "../data/model";
import { GAMES, GAME_BY_ID } from "../games/registry";
import { RHYTHM_LEVELS } from "../music/rhythm";
import { midiSupported } from "../music/midi";
import { href, navigate } from "../router";
import { Avatar, BadgeGrid, formatMinutes, Progress, Segmented, Sheet, Stat } from "../components/ui";
import { RhythmGlyph } from "../components/RhythmBar";
import { GUEST, loadSetup, saveSetup, type Setup } from "./setup";
import { SendScores } from "./SendScores";

export function Hub({ studentId }: { studentId: string }) {
  const db = useDB((d) => d);
  const student = studentId === "guest" ? GUEST : db.students.find((s) => s.id === studentId);
  const [picking, setPicking] = useState<GameId | null>(null);

  const mine = useMemo(() => (student ? sessionsOf(db.sessions, student.id) : []), [db.sessions, student]);
  const streak = practiceStreak(mine);
  const week = inLastDays(mine, 7);
  const badges = useMemo(() => new Set(earnedBadges(mine).map((b) => b.id)), [mine]);
  const challenges = db.challenges.filter((c) => student && c.studentId === student.id && !c.completedAt && c.minutes);

  if (!student) {
    return (
      <div className="card empty stack">
        <h2>We couldn't find that student</h2>
        <a className="btn" href={href("/")}>
          Back to the start
        </a>
      </div>
    );
  }

  const first = student.name.split(" ")[0];
  const isGuest = student.id === "guest";
  const homeDevice = db.settings.homeStudentId === student.id;
  const best = (g: GameId) => Math.max(0, ...mine.filter((s) => s.game === g).map((s) => s.score));

  return (
    <div className="stack">
      <div className="row">
        <Avatar student={student} size={56} />
        <div className="grow">
          <h1>{isGuest ? "Let's play" : `Hi ${first}!`}</h1>
          <p className="muted">
            {isGuest
              ? "Guest games aren't saved."
              : streak.current > 0
                ? `🔥 ${streak.current}-day streak${streak.practicedToday ? ", and you've practiced today" : ". Play today to keep it going"}`
                : "Play a game today to start a streak."}
          </p>
        </div>
        {!homeDevice && (
          <a className="btn btn-ghost btn-sm" href={href("/")}>
            {isGuest ? "Back" : "Not you?"}
          </a>
        )}
      </div>

      {!isGuest && (
        <div className="statrow">
          <Stat k="This week" v={week.length} sub={week.length === 1 ? "game" : "games"} />
          <Stat k="Minutes this week" v={Math.round(minutesOf(week))} />
          <Stat k="Longest streak" v={streak.longest} sub={streak.longest === 1 ? "day" : "days"} />
          <Stat k="Badges" v={badges.size} sub={`of ${BADGES.length}`} />
        </div>
      )}

      {student.playsForPoints && challenges.length > 0 && (
        <section className="card pad stack-sm">
          <h3>Your challenges</h3>
          {challenges.map((c) => {
            const m = challengeMinutes(c, db.sessions);
            return (
              <div key={c.id} className="stack-sm">
                <div className="spread small">
                  <span>
                    <span className="code">{c.code}</span> · {c.title}
                  </span>
                  <span className="num muted">
                    {formatMinutes(Math.min(m, c.minutes!))} of {c.minutes} min
                  </span>
                </div>
                <Progress value={m} max={c.minutes!} tone={m >= c.minutes! ? "good" : undefined} label={`${c.code} minutes`} />
              </div>
            );
          })}
          <p className="tiny muted">Games count toward these. {db.settings.teacherName} checks them off in your lesson.</p>
        </section>
      )}

      <section className="stack-sm">
        <h2>Games</h2>
        <div className="game-grid">
          {GAMES.map((g) => (
            <button key={g.id} type="button" className="game-card" style={{ ["--slot" as string]: `var(--s${g.slot})` }} onClick={() => setPicking(g.id)}>
              <h3>{g.name}</h3>
              <p className="muted small">{g.tagline}</p>
              <div className="meta">
                {!isGuest && best(g.id) > 0 && <span className="pill pill-accent">Best {best(g.id)}</span>}
                {g.id === "rhythm" && !isGuest && (
                  <span>
                    {clearedRungs(mine).size} of {RHYTHM_LEVELS.length} rungs
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      </section>

      {homeDevice && <SendScores student={student} />}

      {!isGuest && (
        <section className="stack-sm">
          <h2>Badges</h2>
          <BadgeGrid all={BADGES} earned={badges} />
        </section>
      )}

      {picking && <SetupSheet studentId={student.id} game={picking} cleared={clearedRungs(mine)} onClose={() => setPicking(null)} />}
    </div>
  );
}

function SetupSheet({ studentId, game, cleared, onClose }: { studentId: string; game: GameId; cleared: Set<number>; onClose: () => void }) {
  const info = GAME_BY_ID[game];
  const [s, setS] = useState<Setup>(() => {
    const saved = loadSetup(studentId, game);
    if (game === "rhythm" && !(saved.stage === 0 || cleared.has(saved.stage - 1))) saved.stage = 0;
    return saved;
  });
  const set = (patch: Partial<Setup>) => setS((x) => ({ ...x, ...patch }));
  const unlocked = (i: number) => i === 0 || cleared.has(i - 1);

  const start = () => {
    saveSetup(studentId, game, s);
    navigate(`/s/${studentId}/play/${game}`);
  };

  return (
    <Sheet open onClose={onClose} title={info.name}>
      {game === "rhythm" ? (
        <div className="stack-sm">
          <span className="eyebrow">Rung</span>
          <div className="rungs" role="group" aria-label="Rung">
            {RHYTHM_LEVELS.map((l, i) => (
              <button key={i} type="button" className="rung" aria-current={s.stage === i} disabled={!unlocked(i)} onClick={() => set({ stage: i })}>
                <RhythmGlyph note={l.glyph} />
                {l.name}
                {cleared.has(i) && (
                  <span className="done" aria-label="cleared">
                    ✓
                  </span>
                )}
              </button>
            ))}
          </div>
          <p className="muted small">{RHYTHM_LEVELS[s.stage].teach}</p>
        </div>
      ) : (
        <div className="stack-sm">
          <span className="eyebrow">Stage</span>
          <div className="stack-sm" role="radiogroup" aria-label="Stage">
            {info.stages.map((st, i) => (
              <label key={i} className="check card" style={{ padding: "10px 14px", boxShadow: "none", borderColor: s.stage === i ? "var(--accent)" : undefined }}>
                <input type="radio" name="stage" checked={s.stage === i} onChange={() => set({ stage: i })} />
                <span>
                  <b>{st.name}</b>
                  <span className="muted small" style={{ display: "block" }}>
                    {st.blurb}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="row-wrap">
        <Segmented label={info.variantLabel} value={s.variant} options={info.variants} onChange={(v) => set({ variant: v })} />
      </div>

      {game !== "rhythm" && (
        <div className="row-wrap">
          <Segmented
            label="Format"
            value={s.format}
            options={[
              { id: "sprint", label: "Sprint · 60s" },
              { id: "steady", label: "Steady · 20" },
            ]}
            onChange={(v) => set({ format: v })}
          />
          {game === "notes" && (
            <Segmented
              label="Answer with"
              value={s.input}
              options={[
                { id: "pad", label: "Letters" },
                { id: "piano", label: "Piano keys" },
              ]}
              onChange={(v) => set({ input: v })}
            />
          )}
        </div>
      )}
      {game === "notes" && midiSupported() && (
        <label className="check">
          <input type="checkbox" checked={s.midi} onChange={(e) => set({ midi: e.target.checked })} />
          <span>Answer on my digital piano (USB or Bluetooth MIDI)</span>
        </label>
      )}
      <p className="tiny muted">
        {game === "rhythm"
          ? "Ten rhythms. Five right in a row clears the rung and unlocks the next one."
          : s.format === "sprint"
            ? "Sprint: as many as you can in 60 seconds. Quick answers earn bonus points."
            : "Steady: 20 questions, no clock. Miss one and you'll see why."}
      </p>
      <div className="sheet-actions">
        <button className="btn btn-primary btn-block" type="button" onClick={start} autoFocus>
          Start
        </button>
      </div>
    </Sheet>
  );
}
