import type { Format, GameId, Student } from "../data/model";
import { getPref, setPref } from "../prefs";

export interface Setup {
  stage: number;
  variant: string;
  format: Format;
  input: "pad" | "piano";
  midi: boolean;
  bpm: number;
}

const DEFAULTS: Record<GameId, Setup> = {
  notes: { stage: 0, variant: "treble", format: "sprint", input: "pad", midi: false, bpm: 76 },
  rhythm: { stage: 0, variant: "match", format: "steady", input: "pad", midi: false, bpm: 76 },
  intervals: { stage: 0, variant: "treble", format: "steady", input: "pad", midi: false, bpm: 76 },
  keys: { stage: 0, variant: "treble", format: "steady", input: "pad", midi: false, bpm: 76 },
};

export function loadSetup(studentId: string, game: GameId): Setup {
  return { ...DEFAULTS[game], ...getPref<Partial<Setup>>(`setup:${studentId}:${game}`, {}) };
}

export function saveSetup(studentId: string, game: GameId, s: Setup) {
  setPref(`setup:${studentId}:${game}`, s);
}

/** Someone with no saved roster entry: plays freely, nothing is recorded. */
export const GUEST: Student = {
  id: "guest",
  name: "Guest",
  color: 7,
  createdAt: "",
  updatedAt: "",
  levelUp: 1,
  pointsCarried: 0,
  playsForPoints: false,
};

export const isGameId = (g: string): g is GameId => g === "notes" || g === "rhythm" || g === "intervals" || g === "keys";
