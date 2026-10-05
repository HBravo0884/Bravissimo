/**
 * The Expressions Music Academy "Level Up" program, as the studio runs it.
 *
 * Booklet: "There are 10 levels in the program, and each level has 1,000 points."
 * "each Challenge has a value between 40 and 150" (custom ones "in increments of 10").
 * Studio recalibration (Aug 2026): "Points land once, when the Challenge is finished."
 * Games and cards carry no point value of their own; their minutes feed a Challenge.
 */

export const LEVELS = 10;
export const POINTS_PER_LEVEL = 1000;
export const MIN_POINTS = 40;
export const MAX_POINTS = 150;

export interface Category {
  code: string;
  name: string;
  hint: string;
}

/** The 15 Challenge categories, in the booklet's Challenge Key order. */
export const CATEGORIES: Category[] = [
  { code: "LA", name: "Lesson Attendance", hint: "Showing up, lesson after lesson" },
  { code: "MA", name: "Music Appreciation", hint: "Listening and live performances" },
  { code: "PR", name: "Practice", hint: "Logged practice sessions" },
  { code: "ML", name: "Music Literacy", hint: "Note names on the staff" },
  { code: "MB", name: "Method Book", hint: "Pieces from the method book" },
  { code: "CO", name: "Coordination", hint: "Reading a written rhythm and tapping it" },
  { code: "ET", name: "Ear Training", hint: "Hearing it and naming or writing it" },
  { code: "SC", name: "Scales", hint: "Scales and five-finger patterns" },
  { code: "TH", name: "Theory", hint: "Theory books and concepts" },
  { code: "CH", name: "Chords", hint: "Building and moving between chords" },
  { code: "IC", name: "Improvisation & Composition", hint: "Making up music" },
  { code: "TE", name: "Technique", hint: "Technical exercises" },
  { code: "AR", name: "Artistry", hint: "Expression and interpretation" },
  { code: "PE", name: "Performance", hint: "Recitals and stage skills" },
  { code: "PP", name: "Piece Perfection", hint: "Polishing a piece to mastery" },
];

export const CATEGORY_BY_CODE: Record<string, Category> = Object.fromEntries(CATEGORIES.map((c) => [c.code, c]));

export interface LibraryChallenge {
  code: string;
  title: string;
  points: number;
  /** When set, minutes played in Bravissimo count toward this challenge. */
  minutes?: number;
}

/** Challenges already priced in the studio's library (Levels 1–3 are published). */
export const CHALLENGE_LIBRARY: LibraryChallenge[] = [
  { code: "LA 1a", title: "Attend 20 lessons", points: 50 },
  { code: "PR 1a", title: "Complete 100 practice sessions", points: 100 },
  { code: "TH 1a", title: "Complete My First Music Theory Book", points: 100 },
  { code: "ET 1b", title: "250 minutes on an ear training app", points: 100, minutes: 250 },
  { code: "PP 1c", title: "Master one current-level piece", points: 90 },
  { code: "MB 1a", title: "Ten pieces from the method book", points: 60 },
  { code: "CH 1a", title: "Broken major triads, seven keys, hands separately", points: 40 },
];

export interface ParsedCode {
  category: string;
  level: number;
  item: string;
}

/**
 * Challenge codes are `<CATEGORY> <level><item>`, e.g. "ET 1b". Notebooks write
 * them several ways ("ET 1b", "Sc2E", "SC 1A"), so parsing ignores case and the space.
 */
export function parseChallengeCode(raw: string): ParsedCode | null {
  const m = /^\s*([A-Za-z]{2})\s*(10|[1-9])\s*([A-Za-z])\s*$/.exec(raw);
  if (!m) return null;
  const category = m[1].toUpperCase();
  if (!CATEGORY_BY_CODE[category]) return null;
  return { category, level: Number(m[2]), item: m[3].toLowerCase() };
}

/** "sc2E" -> "SC 2e" */
export function formatChallengeCode(raw: string): string {
  const p = parseChallengeCode(raw);
  return p ? `${p.category} ${p.level}${p.item}` : raw.trim();
}

export function validPointValue(points: number): boolean {
  return Number.isInteger(points) && points >= MIN_POINTS && points <= MAX_POINTS && points % 10 === 0;
}

/** Studio style: "Level Up 2", never the bare number. */
export function levelLabel(level: number): string {
  return `Level Up ${level}`;
}
