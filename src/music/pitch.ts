export const LETTERS = ["C", "D", "E", "F", "G", "A", "B"] as const;
export type Letter = (typeof LETTERS)[number];

/** -1 flat, 0 natural, 1 sharp */
export type Accidental = -1 | 0 | 1;

export interface Pitch {
  letter: Letter;
  octave: number;
  acc?: Accidental;
}

const NATURAL_SEMITONES = [0, 2, 4, 5, 7, 9, 11];
const ACC_SYMBOL: Record<Accidental, string> = { [-1]: "♭", 0: "", 1: "♯" };

/** Steps along the white keys, C0 = 0. Two pitches a third apart differ by 2. */
export function diatonicIndex(p: Pitch): number {
  return p.octave * 7 + LETTERS.indexOf(p.letter);
}

export function fromDiatonic(index: number, acc: Accidental = 0): Pitch {
  const octave = Math.floor(index / 7);
  const letter = LETTERS[index - octave * 7];
  return acc ? { letter, octave, acc } : { letter, octave };
}

export function midiOf(p: Pitch): number {
  return 12 * (p.octave + 1) + NATURAL_SEMITONES[LETTERS.indexOf(p.letter)] + (p.acc ?? 0);
}

export function frequencyOf(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** "C4", "F♯5", "B♭3" */
export function pitchName(p: Pitch): string {
  return `${p.letter}${ACC_SYMBOL[p.acc ?? 0]}${p.octave}`;
}

/** Parses "C4", "F#5", "Bb3", "F♯5", "B♭3". */
export function parsePitch(s: string): Pitch {
  const m = /^([A-G])([#♯b♭]?)(-?\d)$/.exec(s.trim());
  if (!m) throw new Error(`Bad pitch: ${s}`);
  const acc: Accidental = m[2] === "#" || m[2] === "♯" ? 1 : m[2] === "b" || m[2] === "♭" ? -1 : 0;
  const p: Pitch = { letter: m[1] as Letter, octave: Number(m[3]) };
  if (acc) p.acc = acc;
  return p;
}

/** Inclusive range of natural pitches between two pitches. */
export function naturalRange(from: string, to: string): Pitch[] {
  const a = diatonicIndex(parsePitch(from));
  const b = diatonicIndex(parsePitch(to));
  const out: Pitch[] = [];
  for (let i = a; i <= b; i++) out.push(fromDiatonic(i));
  return out;
}

const SHARP_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];

/** Display name for a MIDI note, sharps preferred: 61 -> "C♯4". */
export function midiName(midi: number): string {
  return `${SHARP_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

export function isBlackKey(midi: number): boolean {
  return [1, 3, 6, 8, 10].includes(((midi % 12) + 12) % 12);
}

/** The letter a white key plays, or null for a black key. */
export function letterOfWhiteKey(midi: number): Letter | null {
  const pc = ((midi % 12) + 12) % 12;
  const i = NATURAL_SEMITONES.indexOf(pc);
  return i < 0 ? null : LETTERS[i];
}
