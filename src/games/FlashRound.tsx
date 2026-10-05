import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Format, ItemStat } from "../data/model";
import { cue, playNotes, unlockAudio } from "../music/audio";
import { connectMidi } from "../music/midi";
import { letterOfWhiteKey } from "../music/pitch";
import { Staff } from "../components/Staff";
import { Piano, type KeyMark } from "../components/Piano";
import { Icon, MusicLabel } from "../components/ui";
import { FLASH_GAMES, type FlashQuestion } from "./flash";
import { addStat, multiplier, pickItem, pointsFor, speedBonus } from "./scoring";

export const SPRINT_MS = 60_000;
export const STEADY_COUNT = 20;

export interface FlashConfig {
  game: "notes" | "intervals" | "keys";
  stage: number;
  variant: string;
  format: Format;
  input: "pad" | "piano";
  midi: boolean;
}

export interface RoundResult {
  score: number;
  correct: number;
  attempts: number;
  bestStreak: number;
  avgMs: number;
  items: Record<string, ItemStat>;
  durationMs: number;
  startedAt: string;
}

interface Tally {
  score: number;
  streak: number;
  bestStreak: number;
  correct: number;
  attempts: number;
  totalMs: number;
  items: Record<string, ItemStat>;
  last: number;
}

const EMPTY: Tally = { score: 0, streak: 0, bestStreak: 0, correct: 0, attempts: 0, totalMs: 0, items: {}, last: 0 };

function combine(a: Record<string, ItemStat>, b: Record<string, ItemStat>): Record<string, ItemStat> {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    const c = out[k] ?? [0, 0, 0];
    out[k] = [c[0] + v[0], c[1] + v[1], c[2] + v[2]];
  }
  return out;
}

export function FlashRound({
  config,
  history,
  onFinish,
  onQuit,
}: {
  config: FlashConfig;
  /** The student's past results for this game, so practice leans toward weak spots. */
  history: Record<string, ItemStat>;
  onFinish: (r: RoundResult) => void;
  onQuit: () => void;
}) {
  const game = FLASH_GAMES[config.game];
  const pool = useMemo(() => game.pool(config.stage, config.variant), [game, config.stage, config.variant]);
  const choices = useMemo(() => game.choices(config.stage, config.variant), [game, config.stage, config.variant]);

  const [phase, setPhase] = useState<"countdown" | "play" | "done">("countdown");
  const [count, setCount] = useState(3);
  const [q, setQ] = useState<FlashQuestion | null>(null);
  const [qn, setQn] = useState(0);
  const [fb, setFb] = useState<{ correct: boolean; chosen: string | null; midi?: number } | null>(null);
  const [tally, setTally] = useState<Tally>(EMPTY);
  const [timeLeft, setTimeLeft] = useState(SPRINT_MS);
  const [midiName, setMidiName] = useState<string | null>(null);

  const t = useRef<Tally>(EMPTY);
  const shownAt = useRef(0);
  const startPerf = useRef(0);
  const startedAt = useRef("");
  const recent = useRef<string[]>([]);
  const retry = useRef<{ item: string; due: number }[]>([]);
  const qIndex = useRef(0);
  const expired = useRef(false);
  const finished = useRef(false);
  const pending = useRef<number | null>(null);

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    setPhase("done");
    const x = t.current;
    onFinish({
      score: x.score,
      correct: x.correct,
      attempts: x.attempts,
      bestStreak: x.bestStreak,
      avgMs: x.attempts ? Math.round(x.totalMs / x.attempts) : 0,
      items: x.items,
      durationMs: Math.round(performance.now() - startPerf.current),
      startedAt: startedAt.current,
    });
  }, [onFinish]);

  const nextQuestion = useCallback(() => {
    pending.current = null;
    if (expired.current) return finish();
    qIndex.current++;
    const last = recent.current[recent.current.length - 1];
    const due = retry.current.find((r) => r.due <= qIndex.current && r.item !== last);
    let item: string;
    if (due) {
      item = due.item;
      retry.current = retry.current.filter((r) => r !== due);
    } else item = pickItem(pool, combine(history, t.current.items), recent.current);
    recent.current = [...recent.current.slice(-5), item];
    setQ(game.question(item, config.stage, config.variant, Math.random));
    setQn(qIndex.current);
    setFb(null);
    shownAt.current = performance.now();
  }, [pool, history, game, config.stage, config.variant, finish]);

  // 3-2-1, then go.
  useEffect(() => {
    if (phase !== "countdown") return;
    if (count === 0) {
      setPhase("play");
      startPerf.current = performance.now();
      startedAt.current = new Date().toISOString();
      nextQuestion();
      return;
    }
    const id = window.setTimeout(() => setCount((c) => c - 1), 650);
    return () => window.clearTimeout(id);
  }, [phase, count, nextQuestion]);

  // Sprint clock.
  useEffect(() => {
    if (phase !== "play" || config.format !== "sprint") return;
    const id = window.setInterval(() => {
      const left = SPRINT_MS - (performance.now() - startPerf.current);
      setTimeLeft(Math.max(0, left));
      if (left <= 0) {
        expired.current = true;
        if (pending.current === null && !finished.current) finish();
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [phase, config.format, finish]);

  useEffect(() => () => {
    if (pending.current !== null) window.clearTimeout(pending.current);
  }, []);

  const answer = useCallback(
    (chosen: string | null, midi?: number) => {
      if (phase !== "play" || !q || fb || finished.current) return;
      unlockAudio();
      const ms = performance.now() - shownAt.current;
      const correct = chosen === q.answer;
      const x = t.current;
      const streak = correct ? x.streak + 1 : 0;
      const pts = pointsFor(correct, streak, config.format === "sprint" ? speedBonus(ms) : 0);
      const next: Tally = {
        score: x.score + pts,
        streak,
        bestStreak: Math.max(x.bestStreak, streak),
        correct: x.correct + (correct ? 1 : 0),
        attempts: x.attempts + 1,
        totalMs: x.totalMs + ms,
        items: addStat(x.items, q.item, correct, ms),
        last: pts,
      };
      t.current = next;
      setTally(next);
      setFb({ correct, chosen, midi });

      const stagger = q.harmonic ? 0 : 0.28;
      if (correct) playNotes(q.play, { stagger, duration: 0.8 });
      else {
        if (chosen !== null) cue("bad");
        window.setTimeout(() => playNotes(q.play, { stagger, duration: 0.9 }), chosen === null ? 0 : 220);
        retry.current.push({ item: q.item, due: qIndex.current + 3 });
      }

      const roundOver = config.format === "steady" && next.attempts >= STEADY_COUNT;
      if (correct) pending.current = window.setTimeout(roundOver ? finish : nextQuestion, 420);
      else if (config.format === "sprint") pending.current = window.setTimeout(nextQuestion, 1500);
      // Steady misses wait for "Next" so there's time to read why.
    },
    [phase, q, fb, config.format, finish, nextQuestion],
  );

  const advance = useCallback(() => {
    if (!fb || fb.correct) return;
    if (config.format === "steady" && t.current.attempts >= STEADY_COUNT) finish();
    else nextQuestion();
  }, [fb, config.format, finish, nextQuestion]);

  const onPianoKey = useCallback((midi: number) => answer(letterOfWhiteKey(midi) ?? "black", midi), [answer]);

  // Computer keyboard: letters for notes, 1–9 for the choice buttons, Enter to continue.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.key === "Enter" || e.key === " ") && fb && !fb.correct) {
        e.preventDefault();
        advance();
        return;
      }
      if (game.input === "letters" && /^[a-g]$/i.test(e.key)) answer(e.key.toUpperCase());
      else if (game.input === "buttons" && /^[1-9]$/.test(e.key)) {
        const c = choices[Number(e.key) - 1];
        if (c) answer(c.id);
      }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [answer, advance, fb, game.input, choices]);

  // A real piano over MIDI, when the student turned it on.
  const onKeyRef = useRef(onPianoKey);
  onKeyRef.current = onPianoKey;
  useEffect(() => {
    if (!config.midi) return;
    let close: (() => void) | undefined;
    connectMidi((n) => onKeyRef.current(n))
      .then((c) => {
        close = c.close;
        setMidiName(c.inputs[0] ?? "MIDI ready");
      })
      .catch(() => setMidiName(null));
    return () => close?.();
  }, [config.midi]);

  if (phase === "countdown") {
    return (
      <div className="play">
        <div className="stage">
          <div className="countdown" aria-live="assertive">
            {count || "Go"}
          </div>
          <p className="muted">{config.format === "sprint" ? "60 seconds. Fast and right both count." : `${STEADY_COUNT} questions, no clock.`}</p>
        </div>
      </div>
    );
  }

  const mult = multiplier(tally.streak);
  const secs = Math.ceil(timeLeft / 1000);
  const marks: Record<number, KeyMark> = {};
  if (fb && fb.midi !== undefined) marks[fb.midi] = fb.correct ? "good" : "bad";

  return (
    <div className="play">
      <div className="hud">
        <div>
          <div className="label">Score</div>
          <div className="score num" aria-live="polite">
            {tally.score}
          </div>
        </div>
        <div className="combo" aria-label={`Streak ${tally.streak}, times ${mult}`}>
          {tally.streak > 0 && <span>🔥 {tally.streak}</span>}
          {mult > 1 && <span className="mult">×{mult}</span>}
        </div>
        <div className="row">
          <div style={{ textAlign: "right" }}>
            <div className="label">{config.format === "sprint" ? "Time" : "Question"}</div>
            <div className="score num">{config.format === "sprint" ? secs : `${Math.min(qn, STEADY_COUNT)}/${STEADY_COUNT}`}</div>
          </div>
          <button className="btn btn-ghost btn-sm" type="button" onClick={tally.attempts ? finish : onQuit} aria-label="End game">
            <Icon name="close" />
          </button>
        </div>
      </div>
      {config.format === "sprint" ? (
        <div className={`timer ${secs <= 10 ? "low" : ""}`}>
          <span style={{ width: `${(timeLeft / SPRINT_MS) * 100}%` }} />
        </div>
      ) : (
        <div className="timer">
          <span style={{ width: `${(tally.attempts / STEADY_COUNT) * 100}%` }} />
        </div>
      )}

      <div className="card stage">
        {q && (
          <>
            <div className="prompt">{q.prompt}</div>
            <div key={qn} className="note-enter" style={{ width: "100%", display: "flex", justifyContent: "center" }}>
              <Staff spec={q.staff} state={fb ? (fb.correct ? "correct" : "wrong") : undefined} />
            </div>
          </>
        )}
        {midiName && <span className="pill pill-accent tiny">🎹 {midiName}</span>}
      </div>

      <div className={`feedback ${fb ? (fb.correct ? "good" : "bad") : "idle"}`} aria-live="polite">
        {!fb && (game.input === "letters" ? (config.input === "piano" ? "Play the note on the keys" : "Tap the letter name") : "Choose an answer")}
        {fb?.correct && q && (
          <span>
            ✓ <MusicLabel text={q.answerLabel} /> <span className="num">+{tally.last}</span>
          </span>
        )}
        {fb && !fb.correct && q && (
          <span className="stack-sm" style={{ alignItems: "center" }}>
            <span>
              It's{" "}
              <b>
                <MusicLabel text={q.answerLabel} />
              </b>
              . <MusicLabel text={q.explain} />
            </span>
            {config.format === "steady" && (
              <button className="btn btn-primary btn-sm" type="button" onClick={advance} autoFocus>
                Next
              </button>
            )}
          </span>
        )}
      </div>

      {game.input === "letters" && config.input === "piano" ? (
        <Piano startC={config.variant === "bass" ? 48 : config.variant === "grand" ? 48 : 60} maxOctaves={2} marks={marks} onKey={onPianoKey} disabled={!!fb} />
      ) : (
        <div className={`answers ${game.input === "letters" ? "letters" : "choices"} ${choices.length > 8 ? "many" : ""}`}>
          {choices.map((c) => {
            const state = fb ? (c.id === q?.answer ? "good" : c.id === fb.chosen ? "bad" : undefined) : undefined;
            return (
              <button
                key={c.id}
                type="button"
                className="answer"
                data-state={state}
                disabled={!!fb}
                onPointerDown={(e) => {
                  e.preventDefault();
                  answer(c.id);
                }}
                onClick={(e) => {
                  // Keyboard activation (Enter/Space on a focused button) arrives as a click with detail 0.
                  if (e.detail === 0) answer(c.id);
                }}
              >
                <MusicLabel text={c.label} />
              </button>
            );
          })}
        </div>
      )}
      {config.format === "steady" && !fb && (
        <button className="btn btn-ghost btn-sm" type="button" onClick={() => answer(null)} style={{ alignSelf: "center" }}>
          Show me
        </button>
      )}
    </div>
  );
}
