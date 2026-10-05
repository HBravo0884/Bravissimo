import { useCallback, useMemo, useState } from "react";
import { store, useDB } from "../data/store";
import { bestKey, challengeMinutes, clearedRungs, mastery, personalBest, sessionsOf, weakestItems, accuracy } from "../data/stats";
import { newlyEarned, type Badge } from "../data/badges";
import type { GameId, Session } from "../data/model";
import { FlashRound, type RoundResult } from "../games/FlashRound";
import { RhythmRound, type RhythmMode, type RhythmResult } from "../games/RhythmRound";
import { GAME_BY_ID, itemLabel, stageName, variantName } from "../games/registry";
import { RHYTHM_LEVELS } from "../music/rhythm";
import { unlockAudio } from "../music/audio";
import { href, navigate } from "../router";
import { formatMinutes, Progress } from "../components/ui";
import { GUEST, isGameId, loadSetup, saveSetup } from "./setup";

interface Outcome {
  session: Omit<Session, "id"> & { id?: string };
  previousBest: number;
  badges: Badge[];
}

export function PlayGame({ studentId, game }: { studentId: string; game: string }) {
  const db = useDB((d) => d);
  const student = studentId === "guest" ? GUEST : db.students.find((s) => s.id === studentId);
  const [round, setRound] = useState(0);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const setup = useMemo(() => (isGameId(game) ? loadSetup(studentId, game) : null), [studentId, game]);

  const mine = useMemo(() => (student ? sessionsOf(db.sessions, student.id) : []), [db.sessions, student]);
  // History is fixed when the round starts, so saving the result doesn't restart it.
  const history = useMemo(() => (isGameId(game) ? mastery(mine, game) : {}), [round, game]);
  const alreadyCleared = useMemo(() => clearedRungs(mine).has(setup?.stage ?? 0), [round]);

  const finish = useCallback(
    (r: RoundResult | RhythmResult) => {
      if (!student || !setup || !isGameId(game)) return;
      const session: Omit<Session, "id"> = {
        studentId: student.id,
        game,
        stage: setup.stage,
        variant: setup.variant,
        format: game === "rhythm" ? "steady" : setup.format,
        startedAt: r.startedAt,
        durationMs: r.durationMs,
        score: r.score,
        correct: r.correct,
        attempts: r.attempts,
        bestStreak: r.bestStreak,
        avgMs: r.avgMs,
        items: r.items,
        device: db.settings.homeStudentId ? "home" : "studio",
        ...("cleared" in r ? { cleared: r.cleared, bpm: r.bpm, ...(r.timingMs !== undefined ? { timingMs: r.timingMs } : {}) } : {}),
      };
      const previousBest = personalBest(mine, bestKey(session));
      let badges: Badge[] = [];
      if (student.id !== "guest" && r.attempts > 0) {
        const saved = store.recordSession(session);
        badges = newlyEarned(mine, [...mine, saved]);
        if ("bpm" in r) saveSetup(student.id, game, { ...setup, bpm: r.bpm });
      }
      setOutcome({ session, previousBest, badges });
    },
    [student, setup, game, mine, db.settings.homeStudentId],
  );

  if (!student || !setup || !isGameId(game)) {
    return (
      <div className="card empty">
        <a className="btn" href={href("/")}>
          Back to the start
        </a>
      </div>
    );
  }

  const exit = () => navigate(`/s/${student.id}`);

  if (outcome) {
    return (
      <Results
        outcome={outcome}
        game={game}
        isGuest={student.id === "guest"}
        challengeLines={db.challenges
          .filter((c) => c.studentId === student.id && !c.completedAt && c.minutes && c.feeds?.includes(game) && student.playsForPoints)
          .map((c) => ({ code: c.code, done: challengeMinutes(c, db.sessions), of: c.minutes! }))}
        onAgain={() => {
          unlockAudio();
          setOutcome(null);
          setRound((n) => n + 1);
        }}
        onExit={exit}
      />
    );
  }

  return game === "rhythm" ? (
    <RhythmRound key={round} rung={setup.stage} mode={setup.variant as RhythmMode} initialBpm={setup.bpm} alreadyCleared={alreadyCleared} onFinish={finish} onQuit={exit} />
  ) : (
    <FlashRound
      key={round}
      config={{ game, stage: setup.stage, variant: setup.variant, format: setup.format, input: setup.input, midi: setup.midi }}
      history={history}
      onFinish={finish}
      onQuit={exit}
    />
  );
}

function Results({
  outcome,
  game,
  isGuest,
  challengeLines,
  onAgain,
  onExit,
}: {
  outcome: Outcome;
  game: GameId;
  isGuest: boolean;
  challengeLines: { code: string; done: number; of: number }[];
  onAgain: () => void;
  onExit: () => void;
}) {
  const s = outcome.session;
  const acc = Math.round(accuracy(s) * 100);
  const isBest = !isGuest && s.score > 0 && s.score > outcome.previousBest;
  const missed = weakestItems(s.items, 4, 1);
  const cleared = s.cleared?.length ? s.cleared[0] : null;

  return (
    <div className="stack" style={{ maxWidth: 640, margin: "0 auto" }}>
      <div className="card pad stack" style={{ alignItems: "center", textAlign: "center" }}>
        <span className="eyebrow">
          {GAME_BY_ID[game].name} · {stageName(game, s.stage)} · {variantName(game, s.variant)}
        </span>
        <div className="result-score num">{s.score}</div>
        {isBest ? (
          <span className="pill pill-good">{outcome.previousBest ? `New personal best! (was ${outcome.previousBest})` : "First score on the board!"}</span>
        ) : (
          !isGuest && outcome.previousBest > 0 && <span className="pill">Your best: {outcome.previousBest}</span>
        )}
        {cleared !== null && (
          <span className="pill pill-accent">
            Rung cleared: {RHYTHM_LEVELS[cleared].name}
            {cleared < RHYTHM_LEVELS.length - 1 ? ` · ${RHYTHM_LEVELS[cleared + 1].name} unlocked` : ""}
          </span>
        )}
        <div className="statrow" style={{ width: "100%" }}>
          <div className="stat">
            <div className="k">Right</div>
            <div className="v num">
              {s.correct}
              <small> / {s.attempts}</small>
            </div>
          </div>
          <div className="stat">
            <div className="k">Accuracy</div>
            <div className="v num">{acc}%</div>
          </div>
          <div className="stat">
            <div className="k">Best streak</div>
            <div className="v num">{s.bestStreak}</div>
          </div>
          {s.avgMs > 0 && (
            <div className="stat">
              <div className="k">Per answer</div>
              <div className="v num">
                {(s.avgMs / 1000).toFixed(1)}
                <small>s</small>
              </div>
            </div>
          )}
          {s.timingMs !== undefined && (
            <div className="stat">
              <div className="k">Timing</div>
              <div className="v num">
                ±{s.timingMs}
                <small>ms</small>
              </div>
            </div>
          )}
        </div>
      </div>

      {outcome.badges.length > 0 && (
        <div className="card pad stack-sm">
          <h3>New badge{outcome.badges.length > 1 ? "s" : ""}!</h3>
          <div className="badges">
            {outcome.badges.map((b) => (
              <div key={b.id} className="badge">
                <span className="ic">{b.icon}</span>
                <div>
                  <b>{b.name}</b>
                  <span>{b.description}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {missed.length > 0 && (
        <div className="card pad stack-sm">
          <h3>Practice these next</h3>
          <div className="row-wrap">
            {missed.map((m) => (
              <span key={m.item} className="pill pill-bad">
                {itemLabel(game, m.item)} · {Math.round(m.accuracy * 100)}%
              </span>
            ))}
          </div>
          <p className="tiny muted">You'll see these more often next time, until they stick.</p>
        </div>
      )}

      {challengeLines.map((c) => (
        <div key={c.code} className="card pad stack-sm">
          <div className="spread small">
            <span>
              Counts toward <span className="code">{c.code}</span>
            </span>
            <span className="num muted">
              {formatMinutes(Math.min(c.done, c.of))} of {c.of} min
            </span>
          </div>
          <Progress value={c.done} max={c.of} tone={c.done >= c.of ? "good" : undefined} label={`${c.code} minutes`} />
        </div>
      ))}

      <div className="btn-row">
        <button className="btn btn-primary grow" type="button" onClick={onAgain} autoFocus>
          Play again
        </button>
        <button className="btn grow" type="button" onClick={onExit}>
          Choose a game
        </button>
      </div>
    </div>
  );
}
