import { frequencyOf } from "./pitch";

/**
 * Small Web Audio voice. Everything is synthesized, so there is nothing to
 * download and sound starts the instant a key is pressed.
 */
let ctx: AudioContext | null = null;
let muted = false;

export function setMuted(value: boolean) {
  muted = value;
}

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor({ latencyHint: "interactive" });
  }
  return ctx;
}

/** Call from a user gesture (tap, key press) so iOS lets audio play. */
export function unlockAudio() {
  const c = context();
  if (c && c.state === "suspended") void c.resume();
}

export function audioNow(): number {
  return context()?.currentTime ?? 0;
}

/** A soft piano-like tone. `when` is in AudioContext seconds (0 = now). */
export function playNote(midi: number, opts: { when?: number; duration?: number; gain?: number } = {}) {
  const c = context();
  if (!c || muted) return;
  const start = Math.max(c.currentTime, opts.when ?? 0) + 0.005;
  const dur = opts.duration ?? 1.1;
  const peak = opts.gain ?? 0.22;
  const f = frequencyOf(midi);

  const out = c.createGain();
  out.gain.setValueAtTime(0, start);
  out.gain.linearRampToValueAtTime(peak, start + 0.006);
  out.gain.exponentialRampToValueAtTime(peak * 0.35, start + 0.18);
  out.gain.exponentialRampToValueAtTime(0.0001, start + dur);

  const tone = c.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.setValueAtTime(Math.min(9000, f * 9), start);
  tone.frequency.exponentialRampToValueAtTime(Math.max(400, f * 2), start + dur);
  tone.connect(out).connect(c.destination);

  const partials: [OscillatorType, number, number][] = [
    ["triangle", 1, 1],
    ["sine", 2, 0.35],
    ["sine", 3, 0.12],
  ];
  for (const [type, mult, level] of partials) {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.value = f * mult;
    g.gain.value = level;
    o.connect(g).connect(tone);
    o.start(start);
    o.stop(start + dur + 0.05);
  }
}

/** Plays several notes, optionally one after another. */
export function playNotes(midis: number[], opts: { stagger?: number; duration?: number } = {}) {
  const c = context();
  if (!c) return;
  const t0 = c.currentTime;
  midis.forEach((m, i) => playNote(m, { when: t0 + i * (opts.stagger ?? 0), duration: opts.duration }));
}

export type ClickKind = "count" | "down" | "note";

/** Metronome-style blip, the same voice Subdivide used. */
export function click(kind: ClickKind, when = 0) {
  const c = context();
  if (!c || muted) return;
  const at = Math.max(c.currentTime, when);
  const cfg =
    kind === "count" ? { f: 1180, g: 0.13, d: 0.045 } : kind === "down" ? { f: 900, g: 0.2, d: 0.075 } : { f: 660, g: 0.24, d: 0.09 };
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "square";
  o.frequency.value = cfg.f;
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(cfg.g, at + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, at + cfg.d);
  o.connect(g).connect(c.destination);
  o.start(at);
  o.stop(at + cfg.d + 0.02);
}

/** A quiet two-note cue for right and wrong answers. */
export function cue(kind: "good" | "bad") {
  const c = context();
  if (!c || muted) return;
  const t = c.currentTime;
  if (kind === "good") {
    playNote(84, { when: t, duration: 0.25, gain: 0.07 });
    playNote(91, { when: t + 0.07, duration: 0.3, gain: 0.07 });
  } else {
    playNote(52, { when: t, duration: 0.3, gain: 0.08 });
  }
}
