import { useState } from "react";
import { apiBase, store } from "../data/store";
import { GAMES, GAME_BY_ID, itemLabel } from "../games/registry";
import { FlashRound, type RoundResult } from "../games/FlashRound";
import { RhythmRound, type RhythmMode, type RhythmResult } from "../games/RhythmRound";
import type { GameId, ItemStat } from "../games/types";
import { RHYTHM_LEVELS } from "../music/rhythm";
import { unlockAudio } from "../music/audio";
import { getPref, setPref } from "../prefs";
import { packetFor } from "../../shared/levelup";
import { isoDate } from "../../shared/dates";
import { href } from "../router";
import { Icon, Segmented } from "../components/ui";

interface Setup {
  stage: number;
  variant: string;
  input: "pad" | "piano";
  bpm: number;
}

const isGame = (g: string): g is GameId => g in GAME_BY_ID;

/**
 * Short games that practise what a card asks. No points, no badges, no clock:
 * the summary is what was right, five in a row at a stated setting, and the
 * minutes, which go to the open ear or theory app packet as Reported.
 */
export function Practice({ token, game }: { token: string; game: string }) {
  const g: GameId = isGame(game) ? game : "notes";
  const info = GAME_BY_ID[g];
  const [setup, setSetup] = useState<Setup>(() => getPref<Setup>(`setup.${g}`, { stage: 0, variant: info.variants[0].id, input: "pad", bpm: 76 }));
  const [round, setRound] = useState(0);
  const [phase, setPhase] = useState<"choose" | "play" | "done">("choose");
  const [result, setResult] = useState<(RoundResult & { cleared?: number[] }) | null>(null);
  const [sent, setSent] = useState<"" | "sent" | "queued">("");
  const history = getPref<Record<string, ItemStat>>(`history.${g}`, {});

  const save = (s: Setup) => {
    setSetup(s);
    setPref(`setup.${g}`, s);
  };

  const setting = () => {
    const stage = info.stages[setup.stage]?.name ?? "";
    const variant = info.variants.find((v) => v.id === setup.variant)?.label ?? setup.variant;
    return g === "rhythm" ? `Subdivide ${String(setup.stage + 1).padStart(2, "0")}, ${variant}` : `${info.name}, ${stage}, ${variant}`;
  };

  const finish = async (r: RoundResult & { cleared?: number[]; bpm?: number }) => {
    setResult(r);
    setPhase("done");
    if (r.bpm) save({ ...setup, bpm: r.bpm });
    // Weak spots come back more often next time, on this device.
    const merged = { ...history };
    for (const [k, v] of Object.entries(r.items)) {
      const c = merged[k] ?? [0, 0, 0];
      merged[k] = [c[0] + v[0], c[1] + v[1], c[2] + v[2]];
    }
    setPref(`history.${g}`, merged);
    if (!r.attempts) return;
    const five = (r.cleared?.length ?? 0) > 0 || r.bestStreak >= 5 ? [setting()] : [];
    const slow = Object.entries(r.items)
      .filter(([, v]) => v[1] > 0 && v[0] / v[1] < 0.7)
      .map(([k]) => itemLabel(g, k))
      .slice(0, 4);
    const minutes = Math.round((r.durationMs / 60000) * 10) / 10;
    const packet = `${packetFor(g)}`;
    const summary = { rounds: 1, attempts: r.attempts, correct: r.correct, fiveInARow: five, slow };
    if (token.startsWith("demo")) {
      const s = store.data().students.find((x) => x.familyKey === token);
      if (s) store.create("practice", { student: s.id, date: isoDate(), game: g, minutes, countsToward: packet, summary, key: `${s.id}|${isoDate()}|${g}` });
      setSent("sent");
      return;
    }
    try {
      const res = await fetch(`${apiBase}/family`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ k: token, action: "practice", game: g, minutes, countsToward: packet, summary }) });
      setSent(res.ok ? "sent" : "queued");
    } catch {
      setSent("queued");
    }
  };

  if (phase === "play") {
    return (
      <div className="family-shell">
        <main className="main playing">
          {g === "rhythm" ? (
            <RhythmRound key={round} rung={setup.stage} mode={setup.variant as RhythmMode} initialBpm={setup.bpm} alreadyCleared={false} onFinish={(r: RhythmResult) => void finish(r)} onQuit={() => setPhase("choose")} />
          ) : (
            <FlashRound key={round} config={{ game: g, stage: setup.stage, variant: setup.variant, format: "steady", input: setup.input, midi: false }} history={history} onFinish={(r) => void finish(r)} onQuit={() => setPhase("choose")} />
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="family-shell">
      <div className="band" aria-hidden="true" />
      <main className="family-main stack">
        <a className="small" href={href(`/f/${token}`)}>
          <Icon name="back" size={16} /> This week
        </a>
        {phase === "done" && result && (
          <section className="card pad stack-sm">
            <h2>{info.name}</h2>
            <p>
              {result.correct} of {result.attempts} right. Best run: {result.bestStreak} in a row.
            </p>
            {(result.cleared?.length ?? 0) > 0 || result.bestStreak >= 5 ? <p className="good-text">Five in a row at {setting()}. Show me at your lesson.</p> : null}
            <p className="small muted">
              {Math.max(1, Math.round(result.durationMs / 60000))} min.{" "}
              {sent === "sent" ? "Your minutes reached your teacher." : sent === "queued" ? "Your minutes will send when you are back online." : ""}
            </p>
            <div className="btn-row">
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => {
                  unlockAudio();
                  setRound((n) => n + 1);
                  setSent("");
                  setPhase("play");
                }}
              >
                Again
              </button>
              <button className="btn" type="button" onClick={() => setPhase("choose")}>
                Change the setting
              </button>
            </div>
          </section>
        )}

        <nav className="row-wrap" aria-label="Games">
          {GAMES.map((x) => (
            <a key={x.id} className={`pill-button ${x.id === g ? "on" : ""}`} href={href(`/f/${token}/play/${x.id}`)} onClick={() => setPhase("choose")}>
              {x.name}
            </a>
          ))}
        </nav>

        {phase === "choose" && (
          <section className="card pad stack">
            <div>
              <h1>{info.name}</h1>
              <p className="muted">{info.tagline}</p>
            </div>
            <div className="field">
              <span>{g === "rhythm" ? "Level" : "Step"}</span>
              <div className="stage-list">
                {(g === "rhythm" ? RHYTHM_LEVELS.map((l) => ({ name: l.name, blurb: l.teach })) : info.stages).map((s, i) => (
                  <button key={i} type="button" className={`stage-choice ${setup.stage === i ? "on" : ""}`} aria-pressed={setup.stage === i} onClick={() => save({ ...setup, stage: i })}>
                    <b>
                      {g === "rhythm" ? `${String(i + 1).padStart(2, "0")} ` : ""}
                      {s.name}
                    </b>
                    <span className="small muted">{s.blurb}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <span>{info.variantLabel}</span>
              <Segmented label={info.variantLabel} value={setup.variant} options={info.variants.map((v) => ({ id: v.id, label: v.label }))} onChange={(v) => save({ ...setup, variant: v })} />
            </div>
            {g === "notes" && (
              <div className="field">
                <span>Answer with</span>
                <Segmented
                  label="Answer with"
                  value={setup.input}
                  options={[
                    { id: "pad", label: "Letters" },
                    { id: "piano", label: "Piano keys" },
                  ]}
                  onChange={(v) => save({ ...setup, input: v })}
                />
              </div>
            )}
            <p className="small muted">Your teacher sets the step with you in the lesson and writes it on the card.</p>
            <button
              className="btn btn-primary btn-block"
              type="button"
              onClick={() => {
                unlockAudio();
                setRound((n) => n + 1);
                setSent("");
                setPhase("play");
              }}
            >
              <Icon name="play" size={18} /> Start
            </button>
          </section>
        )}
      </main>
    </div>
  );
}
