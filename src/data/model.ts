export type GameId = "notes" | "rhythm" | "intervals" | "keys";
export type Format = "sprint" | "steady";

export interface Student {
  id: string;
  name: string;
  /** Avatar color slot, 0–7. Decorative only. */
  color: number;
  createdAt: string;
  updatedAt: string;
  archived?: boolean;
  /** Current Level Up level, 1–10. */
  levelUp: number;
  /** Points already earned at the current level before they were tracked here (the paper notebook). */
  pointsCarried: number;
  /** Studio rule: some students opt out of points; their views show no codes or values. */
  playsForPoints: boolean;
  note?: string;
}

/** [correct, attempts, total response ms] */
export type ItemStat = [number, number, number];

export interface Session {
  id: string;
  studentId: string;
  game: GameId;
  /** Stage (note games) or rung (rhythm ladder), 0-based. */
  stage: number;
  /** Clef for the note games; "match" | "read" | "echo" for the rhythm ladder. */
  variant: string;
  format: Format;
  startedAt: string;
  durationMs: number;
  score: number;
  correct: number;
  attempts: number;
  bestStreak: number;
  avgMs: number;
  items: Record<string, ItemStat>;
  /** Rhythm rungs cleared during this session. */
  cleared?: number[];
  bpm?: number;
  /** Rhythm tap modes: mean absolute timing error in ms. */
  timingMs?: number;
  /** "studio" or "home", so the teacher can tell where practice happened. */
  device?: "studio" | "home";
}

export interface Challenge {
  id: string;
  studentId: string;
  /** "ET 1b" */
  code: string;
  title: string;
  points: number;
  /** When set, minutes played in the linked games since assignment count toward it. */
  minutes?: number;
  feeds?: GameId[];
  assignedAt: string;
  completedAt?: string;
  /** The student's Level Up level when the points landed. */
  completedAtLevel?: number;
  note?: string;
  updatedAt: string;
}

export interface Settings {
  studioName: string;
  teacherName: string;
  /** SHA-256 of the optional teacher PIN. A convenience lock, not security. */
  teacherPinHash?: string;
  sound: boolean;
  /** Set when this device belongs to one student practicing at home. */
  homeStudentId?: string;
  /** Per student: when scores were last sent to the teacher from this device. */
  lastSentAt?: Record<string, string>;
}

export interface DB {
  version: 1;
  students: Student[];
  sessions: Session[];
  challenges: Challenge[];
  settings: Settings;
}

export function emptyDB(): DB {
  return {
    version: 1,
    students: [],
    sessions: [],
    challenges: [],
    settings: { studioName: "Bravo Piano Studio", teacherName: "Mr. Bravo", sound: true },
  };
}

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
