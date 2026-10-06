import { CODES, type CardCode } from "./types";

/**
 * Level Up, the academy's points program, as a mapping on top of the studio's
 * own system. Cards carry a category code; challenges hold the points, which
 * land once, when a challenge is finished. No level is printed anywhere.
 */

export const CATEGORY_NAMES: Record<CardCode, string> = {
  LA: "Lesson Attendance",
  MA: "Music Appreciation",
  PR: "Practice",
  ML: "Music Literacy",
  MB: "Method Book",
  CO: "Coordination",
  ET: "Ear Training",
  SC: "Scales",
  TH: "Theory",
  CH: "Chords",
  IC: "Improvisation & Composition",
  TE: "Technique",
  AR: "Artistry",
  PE: "Performance",
  PP: "Piece Perfection",
};

/** What each code is chosen for, so the right one is picked by what the assignment trains. */
export const CATEGORY_HINTS: Record<CardCode, string> = {
  LA: "showing up, lesson after lesson",
  MA: "listening to a named recording",
  PR: "practice days",
  ML: "naming notes, reading rhythm",
  MB: "pages from the method book",
  CO: "reading a rhythm and tapping it",
  ET: "hearing it and naming it",
  SC: "scales and five-finger patterns",
  TH: "theory sheets and concepts",
  CH: "chord shapes and moving between them",
  IC: "making up music",
  TE: "technical exercises",
  AR: "expression and interpretation",
  PE: "playing for someone",
  PP: "polishing a piece",
};

export interface ChallengeTemplate {
  code: string;
  name: string;
  points: number;
  minutesGoal?: number;
}

/** The library rows the studio uses at every level, with the level digit filled in. */
export function templatesFor(level: number): ChallengeTemplate[] {
  const L = Math.max(1, Math.min(10, Math.round(level) || 1));
  return [
    { code: `LA ${L}a`, name: "20 Lessons Attended Packet", points: 50 },
    { code: `PR ${L}a`, name: "100 Practices Completed Packet", points: 100 },
    { code: `ET ${L}b`, name: "250 Minutes Ear Training App Packet", points: 100, minutesGoal: 250 },
    { code: `TH ${L}b`, name: "250 Minutes Theory App Packet", points: 100, minutesGoal: 250 },
    { code: `PP ${L}a`, name: "Piece Perfection, previous level", points: 40 },
    { code: `PP ${L}b`, name: "Piece Perfection, previous level, memorized", points: 60 },
    { code: `PP ${L}c`, name: "Piece Perfection, current level", points: 90 },
    { code: `PP ${L}d`, name: "Piece Perfection, current level, memorized", points: 110 },
    { code: `PE ${L}a`, name: "Performance, video", points: 40 },
    { code: `PE ${L}c`, name: "Performance, any venue", points: 80 },
    { code: `PE ${L}e`, name: "Performance, academy recital", points: 100 },
  ];
}

export interface ParsedCode {
  category: CardCode;
  level: number;
  item: string;
}

/** Notebooks write codes several ways ("ET 1b", "Sc2E", "LA3a"); this reads them all. */
export function parseChallengeCode(raw: string): ParsedCode | null {
  const m = /^\s*([A-Za-z]{2})\s*(10|[1-9])\s*([A-Za-z])\s*$/.exec(raw);
  if (!m) return null;
  const category = m[1].toUpperCase() as CardCode;
  if (!(CODES as readonly string[]).includes(category)) return null;
  return { category, level: Number(m[2]), item: m[3].toLowerCase() };
}

export function formatChallengeCode(raw: string): string {
  const p = parseChallengeCode(raw);
  return p ? `${p.category} ${p.level}${p.item}` : raw.trim();
}

/** Custom challenges stay inside the fifteen and between 40 and 150, in tens. */
export function validPoints(points: number): boolean {
  return Number.isInteger(points) && points >= 40 && points <= 150 && points % 10 === 0;
}

/** App minutes fill a packet's blocks: 25 minutes a block for a 250-minute packet. */
export function blocksFromMinutes(minutes: number, goal: number): number {
  if (!goal) return 0;
  return Math.max(0, Math.min(10, Math.floor((minutes / goal) * 10)));
}

/** Which app packet a game's minutes go to: ear and rhythm to ET, note reading and theory to TH. */
export function packetFor(game: string): "ET" | "TH" {
  return game === "rhythm" || game.startsWith("ear") ? "ET" : "TH";
}
