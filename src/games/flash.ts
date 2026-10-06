import { diatonicIndex, fromDiatonic, LETTERS, midiOf, naturalRange, parsePitch, pitchName, type Pitch } from "../music/pitch";
import { grandStaffClef, INTERVAL_NAMES, keySignatureTip, MAJOR_KEYS, type Clef, type KeySigType } from "../music/staff";
import type { Rng } from "./scoring";

/* ------------------------------- shared shapes ------------------------------- */

export type ClefChoice = "treble" | "bass" | "grand";

export interface StaffNote {
  pitch: Pitch;
  staff: Clef;
}

export interface StaffSpec {
  clef: ClefChoice;
  notes: StaffNote[];
  layout: "single" | "melodic" | "harmonic";
  keySig?: { type: KeySigType; count: number } | null;
}

export interface Choice {
  id: string;
  label: string;
}

export interface FlashQuestion {
  item: string;
  staff: StaffSpec;
  answer: string;
  answerLabel: string;
  /** Shown after a miss, so the game teaches rather than only tests. */
  explain: string;
  /** MIDI notes to sound when the answer is revealed. */
  play: number[];
  harmonic: boolean;
  prompt: string;
}

export interface Stage {
  name: string;
  blurb: string;
}

export interface FlashGame {
  id: "notes" | "intervals" | "keys";
  stages: Stage[];
  variants: { id: string; label: string }[];
  /** "letters" shows the letter pad / piano; "buttons" shows the game's choices. */
  input: "letters" | "buttons";
  pool(stage: number, variant: string): string[];
  question(item: string, stage: number, variant: string, rng: Rng): FlashQuestion;
  choices(stage: number, variant: string): Choice[];
  itemLabel(item: string): string;
}

/* --------------------------------- Note Rush --------------------------------- */

interface NoteStage extends Stage {
  treble: string[];
  bass: string[];
}

const range = (a: string, b: string) => naturalRange(a, b).map(pitchName);

export const NOTE_STAGES: NoteStage[] = [
  {
    name: "First ten",
    blurb: "Middle C up to G, and bass C up to G: the first ten notes on the staff.",
    treble: range("C4", "G4"),
    bass: range("C3", "G3"),
  },
  {
    name: "Landmarks",
    blurb: "Middle C, Treble G and Bass F, plus their next-door neighbors.",
    treble: ["C4", "D4", "F4", "G4", "A4"],
    bass: ["E3", "F3", "G3", "B3", "C4"],
  },
  {
    name: "Whole staff",
    blurb: "Every line and every space, with Middle C on both staffs.",
    treble: range("C4", "G5"),
    bass: range("F2", "C4"),
  },
  {
    name: "Ledger lines",
    blurb: "Above and below the staff, where landmarks really pay off.",
    treble: range("A3", "C6"),
    bass: range("C2", "E4"),
  },
];

const LANDMARKS: Record<Clef, [string, string][]> = {
  treble: [
    ["C4", "Middle C"],
    ["G4", "Treble G"],
    ["C5", "Treble C"],
    ["G5", "High G"],
    ["C6", "High C"],
  ],
  bass: [
    ["C4", "Middle C"],
    ["F3", "Bass F"],
    ["C3", "Bass C"],
    ["F2", "Low F"],
    ["C2", "Low C"],
  ],
};

/** "That's A: one step above Treble G." Measure from the nearest landmark, as in lessons. */
export function landmarkHint(p: Pitch, staff: Clef): string {
  const d = diatonicIndex(p);
  let best = LANDMARKS[staff][0];
  let bestDist = Infinity;
  for (const lm of LANDMARKS[staff]) {
    const dist = Math.abs(diatonicIndex(parsePitch(lm[0])) - d);
    if (dist < bestDist) {
      best = lm;
      bestDist = dist;
    }
  }
  const delta = d - diatonicIndex(parsePitch(best[0]));
  if (delta === 0) return `That's ${p.letter}: ${best[1]}, one of your landmarks.`;
  const dir = delta > 0 ? "above" : "below";
  const size = Math.abs(delta);
  const how = size === 1 ? "one step" : size === 2 ? "a skip" : `${size} steps`;
  return `That's ${p.letter}: ${how} ${dir} ${best[1]}.`;
}

export const noteRush: FlashGame = {
  id: "notes",
  input: "letters",
  stages: NOTE_STAGES,
  variants: [
    { id: "treble", label: "Treble" },
    { id: "bass", label: "Bass" },
    { id: "grand", label: "Both" },
  ],
  pool(stage, variant) {
    const st = NOTE_STAGES[stage] ?? NOTE_STAGES[0];
    const t = st.treble.map((n) => `treble:${n}`);
    const b = st.bass.map((n) => `bass:${n}`);
    return variant === "treble" ? t : variant === "bass" ? b : [...t, ...b];
  },
  question(item, _stage, variant) {
    const [staff, name] = item.split(":") as [Clef, string];
    const pitch = parsePitch(name);
    return {
      item,
      staff: { clef: variant as ClefChoice, notes: [{ pitch, staff }], layout: "single" },
      answer: pitch.letter,
      answerLabel: pitch.letter,
      explain: landmarkHint(pitch, staff),
      play: [midiOf(pitch)],
      harmonic: false,
      prompt: "Name the note",
    };
  },
  choices: () => LETTERS.map((l) => ({ id: l, label: l })),
  itemLabel(item) {
    const [staff, name] = item.split(":");
    return `${name} ${staff === "bass" ? "bass" : "treble"}`;
  },
};

/* --------------------------------- Intervals --------------------------------- */

const INTERVAL_STAGES: (Stage & { sizes: number[]; harmonic: boolean })[] = [
  { name: "Steps & skips", blurb: "A step is a 2nd, a skip is a 3rd. Line to space, or line to line?", sizes: [2, 3], harmonic: false },
  { name: "2nd to 5th", blurb: "Count the letters, both ends included. Some are stacked now.", sizes: [2, 3, 4, 5], harmonic: true },
  { name: "Up to the octave", blurb: "Every distance from a 2nd to the octave.", sizes: [2, 3, 4, 5, 6, 7, 8], harmonic: true },
];

const INTERVAL_RANGE: Record<Clef, [string, string]> = { treble: ["C4", "C6"], bass: ["E2", "E4"] };

export const intervals: FlashGame = {
  id: "intervals",
  input: "buttons",
  stages: INTERVAL_STAGES,
  variants: [
    { id: "treble", label: "Treble" },
    { id: "bass", label: "Bass" },
  ],
  pool: (stage) => (INTERVAL_STAGES[stage] ?? INTERVAL_STAGES[0]).sizes.map((n) => `int:${n}`),
  question(item, stage, variant, rng) {
    const size = Number(item.split(":")[1]);
    const clef = (variant === "bass" ? "bass" : "treble") as Clef;
    const [lo, hi] = INTERVAL_RANGE[clef].map((s) => diatonicIndex(parsePitch(s)));
    const bottom = lo + Math.floor(rng() * (hi - lo - (size - 1) + 1));
    const a = fromDiatonic(bottom);
    const b = fromDiatonic(bottom + size - 1);
    const st = INTERVAL_STAGES[stage] ?? INTERVAL_STAGES[0];
    const harmonic = st.harmonic && rng() < 0.4;
    const down = !harmonic && rng() < 0.4;
    const notes = (down ? [b, a] : [a, b]).map((pitch) => ({ pitch, staff: clef }));
    const letters: string[] = [];
    for (let i = 0; i < size; i++) letters.push(fromDiatonic(bottom + i).letter);
    const spelled = down ? letters.slice().reverse() : letters;
    const shape = size % 2 === 1 ? "line to line or space to space" : "line to space";
    return {
      item,
      staff: { clef, notes, layout: harmonic ? "harmonic" : "melodic" },
      answer: String(size),
      answerLabel: INTERVAL_NAMES[size],
      explain: `Count the letters: ${spelled.join(" ")}. That's ${size} letters, ${size === 8 ? "an octave" : `a ${INTERVAL_NAMES[size]}`} (${shape}).`,
      play: notes.map((x) => midiOf(x.pitch)),
      harmonic,
      prompt: harmonic ? "How far apart?" : down ? "How far down?" : "How far up?",
    };
  },
  choices: (stage) => (INTERVAL_STAGES[stage] ?? INTERVAL_STAGES[0]).sizes.map((n) => ({ id: String(n), label: INTERVAL_NAMES[n] })),
  itemLabel: (item) => INTERVAL_NAMES[Number(item.split(":")[1])] ?? item,
};

/* ------------------------------- Key Signatures ------------------------------ */

const KEY_STAGES: (Stage & { keys: string[] })[] = [
  { name: "C, G and F", blurb: "No sharps, one sharp, one flat: the first three keys.", keys: ["C", "G", "F"] },
  { name: "Up to three", blurb: "Up to three sharps or flats.", keys: ["C", "G", "D", "A", "F", "Bb", "Eb"] },
  // The book's clock stops at six each way (F♯ and G♭ at six o'clock); the game never quizzes past what the book teaches.
  { name: "Around the clock", blurb: "Every key to six sharps and six flats.", keys: MAJOR_KEYS.filter((k) => k.count <= 6).map((k) => k.id) },
];

const KEY_BY_ID = Object.fromEntries(MAJOR_KEYS.map((k) => [k.id, k]));

function tonicTriad(id: string): number[] {
  const tonic = midiOf(parsePitch(`${id}4`));
  const root = tonic > 66 ? tonic - 12 : tonic;
  return [root, root + 4, root + 7];
}

export const keySignatures: FlashGame = {
  id: "keys",
  input: "buttons",
  stages: KEY_STAGES,
  variants: [
    { id: "treble", label: "Treble" },
    { id: "bass", label: "Bass" },
  ],
  pool: (stage) => (KEY_STAGES[stage] ?? KEY_STAGES[0]).keys.map((k) => `key:${k}`),
  question(item, _stage, variant) {
    const key = KEY_BY_ID[item.split(":")[1]];
    return {
      item,
      staff: {
        clef: variant === "bass" ? "bass" : "treble",
        notes: [],
        layout: "single",
        keySig: key.type ? { type: key.type, count: key.count } : null,
      },
      answer: key.id,
      answerLabel: `${key.name} major`,
      explain: keySignatureTip(key),
      play: tonicTriad(key.id),
      harmonic: true,
      prompt: "Which major key?",
    };
  },
  choices: (stage) => (KEY_STAGES[stage] ?? KEY_STAGES[0]).keys.map((k) => ({ id: k, label: KEY_BY_ID[k].name })),
  itemLabel: (item) => `${KEY_BY_ID[item.split(":")[1]]?.name ?? item} major`,
};

export const FLASH_GAMES = { notes: noteRush, intervals, keys: keySignatures };

/** Which staff a note belongs on when the game shows both staffs. */
export { grandStaffClef };
