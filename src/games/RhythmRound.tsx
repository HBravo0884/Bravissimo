import { useCallback, useEffect, useRef, useState } from "react";
import type { ItemStat } from "../data/model";
import { audioNow, click, cue, unlockAudio } from "../music/audio";
import { CLEAR_STREAK, distractor, gradeTaps, makeBar, onsets, RHYTHM_LEVELS, sameSound, type Bar } from "../music/rhythm";
import { RhythmBar } from "../components/RhythmBar";
import { Icon } from "../components/ui";
import { addStat, multiplier, pointsFor, timingBonus } from "./scoring";
import type { RoundResult } from "./FlashRound";

export const RHYTHM_COUNT = 10;

export type RhythmMode = "match" | "read" | "echo";

export interface RhythmResult extends RoundResult {
  cleared: number[];
  bpm: number;
  timingMs?: number;
}

const shuffle = <T,>(a: T[]): T[] => {
  const x = a.slice();
  for (let i = x.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [x[i], x[j]] = [x[j], x[i]];
  }
  return x;
};

/**
 * Subdivide's three exercises, as a set of ten rhythms:
 * Listen & match (hear it, pick the notation), Read & tap (see it, tap it after a
 * count-in), Hear & tap (hear it, tap it back, then see it).
 */
export function RhythmRound({
  rung,
  mode,
  initialBpm,
  alreadyCleared,
  onFinish,
  onQuit,
}: {
  rung: number;
  mode: RhythmMode;
  initialBpm: number;
  alreadyCleared: boolean;
  onFinish: (r: RhythmResult) => void;
  onQuit: () => void;
}) {
  const level = RHYTHM_LEVELS[rung];
  const [bpm, setBpm] = useState(initialBpm);
  const [bar, setBar] = useState<Bar>(() => makeBar(rung));
  const [options, setOptions] = useState<Bar[]>([]);
  const [answered, setAnswered] = useState<null | { ok: boolean; chosen?: number; text: string }>(null);
  const [playing, setPlaying] = useState(false);
  const [armed, setArmed] = useState(false);
  const [lit, setLit] = useState(-1);
  const [hit, setHit] = useState(false);
  const [tally, setTally] = useState({ score: 0, streak: 0, bestStreak: 0, correct: 0, attempts: 0, run: 0, last: 0 });
  const [clearedNow, setClearedNow] = useState(false);

  const items = useRef<Record<string, ItemStat>>({});
  const timing = useRef<number[]>([]);
  const taps = useRef<number[]>([]);
  const startAt = useRef(0);
  const timers = useRef<number[]>([]);
  const t0 = useRef(performance.now());
  const startedAt = useRef(new Date().toISOString());
  const tallyRef = useRef(tally);
  tallyRef.current = tally;

  const newRhythm = useCallback(() => {
    const b = makeBar(rung);
    setBar(b);
    if (mode === "match") {
      const w1 = distractor(rung, b);
      const w2 = distractor(rung, b, [w1]);
      setOptions(shuffle([b, w1, w2]));
    }
    setAnswered(null);
    taps.current = [];
  }, [rung, mode]);

  useEffect(() => {
    newRhythm();
    return () => timers.current.forEach((id) => window.clearTimeout(id));
  }, [newRhythm]);

  const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, Math.max(0, ms)));

  const finish = useCallback(() => {
    const x = tallyRef.current;
    const errs = timing.current;
    onFinish({
      score: x.score,
      correct: x.correct,
      attempts: x.attempts,
      bestStreak: x.bestStreak,
      avgMs: 0,
      items: items.current,
      durationMs: Math.round(performance.now() - t0.current),
      startedAt: startedAt.current,
      cleared: clearedNow || (x.run >= CLEAR_STREAK && !alreadyCleared) ? [rung] : [],
      bpm,
      timingMs: errs.length ? Math.round(errs.reduce((a, b) => a + b, 0) / errs.length) : undefined,
    });
  }, [onFinish, clearedNow, alreadyCleared, rung, bpm]);

  const record = useCallback(
    (ok: boolean, bonus: number, text: string, chosen?: number) => {
      const x = tallyRef.current;
      const streak = ok ? x.streak + 1 : 0;
      const run = ok ? x.run + 1 : 0;
      const pts = pointsFor(ok, streak, bonus);
      items.current = addStat(items.current, `rung:${rung}:${mode}`, ok, 0);
      const next = {
        score: x.score + pts,
        streak,
        bestStreak: Math.max(x.bestStreak, streak),
        correct: x.correct + (ok ? 1 : 0),
        attempts: x.attempts + 1,
        run,
        last: pts,
      };
      setTally(next);
      cue(ok ? "good" : "bad");
      let extra = "";
      if (ok && run >= CLEAR_STREAK && !alreadyCleared && !clearedNow) {
        setClearedNow(true);
        extra = rung < RHYTHM_LEVELS.length - 1 ? ` Rung cleared! ${RHYTHM_LEVELS[rung + 1].name} is unlocked.` : " That's the whole ladder!";
      } else if (ok && !alreadyCleared && !clearedNow) extra = ` ${CLEAR_STREAK - run} more in a row clears this rung.`;
      setAnswered({ ok, chosen, text: text + extra });
    },
    [rung, mode, alreadyCleared, clearedNow],
  );

  const grade = useCallback(() => {
    setArmed(false);
    const g = gradeTaps(bar, taps.current, startAt.current, bpm);
    if (g.hits) timing.current.push(g.meanAbsErrorMs);
    record(
      g.ok,
      g.ok ? timingBonus(g.meanAbsErrorMs) : 0,
      g.ok
        ? `Right on. ${g.hits} of ${g.wanted} on time, average ${g.meanErrorMs > 0 ? "+" : ""}${g.meanErrorMs} ms.`
        : `Not yet. ${g.hits} of ${g.wanted} landed in time${g.extra ? `, plus ${g.extra} extra tap${g.extra > 1 ? "s" : ""}` : ""}.`,
    );
  }, [bar, bpm, record]);

  const play = useCallback(() => {
    if (playing) return;
    unlockAudio();
    const now = audioNow();
    const spb = 60 / bpm;
    const start = now + 0.15;
    setPlaying(true);
    for (let i = 0; i < 4; i++) {
      click("count", start + i * spb);
      later(() => setLit(i), (start - now + i * spb) * 1000);
    }
    const bars = (from: number) => {
      for (let i = 0; i < 4; i++) later(() => setLit(i), (from - now + i * spb) * 1000);
    };
    const sound = (from: number) => onsets(bar).forEach((b) => click(b === 0 ? "down" : "note", from + b * spb));
    const counts = (from: number) => {
      for (let i = 0; i < 4; i++) click("count", from + i * spb);
    };

    let barStart = start + 4 * spb;
    const tapping = mode !== "match" && !answered;
    if (tapping && mode === "echo") {
      // Call and response: hear the bar, then tap it back over a quiet count.
      sound(barStart);
      bars(barStart);
      barStart += 4 * spb;
      counts(barStart);
    } else if (tapping) counts(barStart);
    else sound(barStart);
    bars(barStart);
    startAt.current = barStart;

    if (tapping) {
      taps.current = [];
      later(() => setArmed(true), (barStart - now - spb * 0.5) * 1000);
    }
    later(() => {
      setPlaying(false);
      setLit(-1);
      if (tapping) grade();
    }, (barStart - now + 4 * spb) * 1000 + 320);
  }, [playing, bpm, mode, bar, answered, grade]);

  const tap = useCallback(() => {
    if (!armed) return;
    taps.current.push(audioNow());
    setHit(true);
    later(() => setHit(false), 90);
  }, [armed]);

  const choose = (i: number) => {
    if (answered || mode !== "match") return;
    const ok = sameSound(options[i], bar);
    record(ok, 0, ok ? "Yes, that's the one you heard." : "Not that one. The green rhythm is the one that played.", i);
  };

  const next = useCallback(() => {
    if (tallyRef.current.attempts >= RHYTHM_COUNT) finish();
    else newRhythm();
  }, [finish, newRhythm]);

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        if (armed) tap();
        else if (answered) next();
        else if (!playing) play();
      } else if (e.key === "Enter" && answered) next();
      else if (mode === "match" && !answered && /^[1-3abc]$/i.test(e.key)) choose("1a2b3c".indexOf(e.key.toLowerCase()) >> 1);
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  });

  const showNotation = mode === "read" || (mode === "echo" && answered);
  const mult = multiplier(tally.streak);

  return (
    <div className="play">
      <div className="hud">
        <div>
          <div className="label">Score</div>
          <div className="score num">{tally.score}</div>
        </div>
        <div className="combo">
          {tally.streak > 0 && <span>🔥 {tally.streak}</span>}
          {mult > 1 && <span className="mult">×{mult}</span>}
        </div>
        <div className="row">
          <div style={{ textAlign: "right" }}>
            <div className="label">Rhythm</div>
            <div className="score num">
              {Math.min(tally.attempts + (answered ? 0 : 1), RHYTHM_COUNT)}/{RHYTHM_COUNT}
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" type="button" onClick={tally.attempts ? finish : onQuit} aria-label="End game">
            <Icon name="close" />
          </button>
        </div>
      </div>
      <div className="timer">
        <span style={{ width: `${(tally.attempts / RHYTHM_COUNT) * 100}%` }} />
      </div>

      <div className="card pad stack">
        <div>
          <h3>{level.name}</h3>
          <p className="muted small">{level.teach}</p>
        </div>
        {showNotation ? (
          <RhythmBar bar={bar} />
        ) : (
          <div className="stack-sm" style={{ alignItems: "center", padding: "10px 0" }}>
            <div className="beats" aria-hidden="true">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className={`beat ${lit === i ? "on" : ""}`}>
                  {i + 1}
                </span>
              ))}
            </div>
            <p className="muted small">{mode === "match" ? "Listen, then choose the rhythm you heard." : "Listen, then tap it back. The notation appears after."}</p>
          </div>
        )}
        <div className="row-wrap">
          <button className="btn btn-primary" type="button" onClick={play} disabled={playing}>
            <Icon name="play" size={18} /> {answered ? "Hear it again" : "Play"}
          </button>
          {answered && (
            <button className="btn" type="button" onClick={next} autoFocus>
              {tally.attempts >= RHYTHM_COUNT ? "See results" : "Next rhythm"}
            </button>
          )}
          <label className="row grow" style={{ minWidth: 200, gap: 10 }}>
            <span className="tiny muted" style={{ fontWeight: 700 }}>
              TEMPO
            </span>
            <input
              type="range"
              min={50}
              max={140}
              step={2}
              value={bpm}
              onChange={(e) => setBpm(Number(e.target.value))}
              disabled={playing}
              className="grow"
              style={{ accentColor: "var(--accent)", minHeight: 44 }}
              aria-label="Tempo in beats per minute"
            />
            <span className="num small" style={{ minWidth: 62, textAlign: "right", fontWeight: 650 }}>
              {bpm} bpm
            </span>
          </label>
        </div>
        {showNotation && lit >= 0 && (
          <div className="beats" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className={`beat ${lit === i ? "on" : ""}`}>
                {i + 1}
              </span>
            ))}
          </div>
        )}
      </div>

      {answered && (
        <div className={`feedback ${answered.ok ? "good" : "bad"}`} aria-live="polite">
          <span>
            {answered.ok ? "✓ " : ""}
            {answered.text} {answered.ok && <span className="num">+{tally.last}</span>}
          </span>
        </div>
      )}

      {mode === "match" ? (
        <div className="options">
          {options.map((o, i) => (
            <button
              key={i}
              type="button"
              className="option"
              disabled={!!answered}
              data-state={answered ? (sameSound(o, bar) ? "good" : answered.chosen === i ? "bad" : undefined) : undefined}
              onClick={() => choose(i)}
              aria-label={`Option ${"ABC"[i]}`}
            >
              <span className="tag">{"ABC"[i]}</span>
              <RhythmBar bar={o} label={`Rhythm option ${"ABC"[i]}`} />
            </button>
          ))}
        </div>
      ) : (
        <button
          type="button"
          className={`tapzone ${armed ? "armed" : ""} ${hit ? "hit" : ""}`}
          onPointerDown={(e) => {
            e.preventDefault();
            tap();
          }}
          disabled={!!answered}
        >
          {armed ? "Tap!" : answered ? "Done" : "Press Play, listen to the count-in, then tap here (or the space bar)"}
        </button>
      )}
    </div>
  );
}
