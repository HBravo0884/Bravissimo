import { diatonicIndex, parsePitch, type Letter, type Pitch } from "./pitch";

export type Clef = "treble" | "bass";

/** Diatonic index of each clef's bottom line: E4 for treble, G2 for bass. */
const BOTTOM_LINE: Record<Clef, number> = {
  treble: diatonicIndex(parsePitch("E4")),
  bass: diatonicIndex(parsePitch("G2")),
};

/**
 * Position on a five-line staff, counted in lines-and-spaces from the bottom line.
 * 0 = bottom line, 1 = first space, 8 = top line. Negative values sit below the staff.
 */
export function staffStep(p: Pitch, clef: Clef): number {
  return diatonicIndex(p) - BOTTOM_LINE[clef];
}

/** Steps of the ledger lines a note at `step` needs (lines only, so even steps). */
export function ledgerSteps(step: number): number[] {
  const out: number[] = [];
  for (let s = -2; s >= step; s -= 2) out.push(s);
  for (let s = 10; s <= step; s += 2) out.push(s);
  return out;
}

/** Which staff a note sits on in a grand staff: middle C and up on treble. */
export function grandStaffClef(p: Pitch): Clef {
  return diatonicIndex(p) >= diatonicIndex(parsePitch("C4")) ? "treble" : "bass";
}

/* ------------------------------ key signatures ------------------------------ */

export type KeySigType = "sharp" | "flat";

export interface MajorKey {
  id: string;
  name: string;
  count: number;
  type: KeySigType | null;
}

export const MAJOR_KEYS: MajorKey[] = [
  { id: "C", name: "C", count: 0, type: null },
  { id: "G", name: "G", count: 1, type: "sharp" },
  { id: "D", name: "D", count: 2, type: "sharp" },
  { id: "A", name: "A", count: 3, type: "sharp" },
  { id: "E", name: "E", count: 4, type: "sharp" },
  { id: "B", name: "B", count: 5, type: "sharp" },
  { id: "F#", name: "F♯", count: 6, type: "sharp" },
  { id: "C#", name: "C♯", count: 7, type: "sharp" },
  { id: "F", name: "F", count: 1, type: "flat" },
  { id: "Bb", name: "B♭", count: 2, type: "flat" },
  { id: "Eb", name: "E♭", count: 3, type: "flat" },
  { id: "Ab", name: "A♭", count: 4, type: "flat" },
  { id: "Db", name: "D♭", count: 5, type: "flat" },
  { id: "Gb", name: "G♭", count: 6, type: "flat" },
  { id: "Cb", name: "C♭", count: 7, type: "flat" },
];

export const SHARP_ORDER: Letter[] = ["F", "C", "G", "D", "A", "E", "B"];
export const FLAT_ORDER: Letter[] = ["B", "E", "A", "D", "G", "C", "F"];

const KEY_SIG_POSITIONS: Record<KeySigType, Record<Clef, string[]>> = {
  sharp: {
    treble: ["F5", "C5", "G5", "D5", "A4", "E5", "B4"],
    bass: ["F3", "C3", "G3", "D3", "A2", "E3", "B2"],
  },
  flat: {
    treble: ["B4", "E5", "A4", "D5", "G4", "C5", "F4"],
    bass: ["B2", "E3", "A2", "D3", "G2", "C3", "F2"],
  },
};

/** Staff steps of each accidental in a key signature, in the order they are written. */
export function keySignatureSteps(type: KeySigType, count: number, clef: Clef): number[] {
  return KEY_SIG_POSITIONS[type][clef].slice(0, count).map((s) => staffStep(parsePitch(s), clef));
}

/** The studio's two shortcuts for naming a major key from its signature. */
export function keySignatureTip(key: MajorKey): string {
  if (!key.type) return "No sharps or flats: that's C major.";
  if (key.type === "sharp") {
    const last = SHARP_ORDER[key.count - 1];
    return `The newest sharp, ${last}♯, is one key below the new home. One key up: ${key.name} major.`;
  }
  const last = FLAT_ORDER[key.count - 1];
  return `The newest flat, ${last}♭, sits on 4 of the new home. Call it 4 and walk down to 1: ${key.name} major.`;
}

/* --------------------------------- intervals -------------------------------- */

export const INTERVAL_NAMES: Record<number, string> = {
  1: "Unison",
  2: "2nd",
  3: "3rd",
  4: "4th",
  5: "5th",
  6: "6th",
  7: "7th",
  8: "Octave",
};

/** Generic interval number between two pitches (counting both ends, so C up to E = 3). */
export function intervalNumber(a: Pitch, b: Pitch): number {
  return Math.abs(diatonicIndex(b) - diatonicIndex(a)) + 1;
}
