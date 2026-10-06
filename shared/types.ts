/**
 * The studio record, as the app and the Notion function both see it.
 *
 * Notion is the store. Students, Lessons, Threads and Songs are the existing
 * Student tracker databases; the rest are databases the app adds beside them.
 * Every record carries the Notion page id (or a local "tmp_" id until it syncs)
 * and the time Notion last saw it change.
 */

export type Lang = "en" | "es";

/** The fifteen Level Up categories, in the booklet's order. */
export const CODES = ["LA", "MA", "PR", "ML", "MB", "CO", "ET", "SC", "TH", "CH", "IC", "TE", "AR", "PE", "PP"] as const;
export type CardCode = (typeof CODES)[number];

export const LANES = ["Technique", "Literacy", "Theory", "Ear", "Repertoire", "Creation", "Performance"] as const;
export type Lane = (typeof LANES)[number];

export const POINTS_MODES = ["plays for points", "no points", "musical feedback instead"] as const;
export type PointsMode = (typeof POINTS_MODES)[number];

export const AGE_BANDS = ["under 8", "8 to 10", "11 to 13", "14 to 17", "adult"] as const;
export type AgeBand = (typeof AGE_BANDS)[number];

export const FLAGS = ["no eyes-closed or memory work", "not in recital", "no note names inside the notes", "preferred first name"] as const;

export const FERN = ["Fingering", "Expression", "Rhythm", "Notes"] as const;

/** Evidence marks: only Verified may appear as fact on anything a family reads. */
export type Mark = "Verified" | "Reported" | "Unverified";

export interface Base {
  id: string;
  /** Notion's last_edited_time, when the record came from Notion. */
  edited?: string;
}

export interface Student extends Base {
  /** Notion `Name`: the full name, used to match Opus1 and name the playlist. */
  name: string;
  /** The name on a handout. Falls back to the first word of `name`. */
  displayName: string;
  status: string;
  /** Notion `Slot`, e.g. "Monday 4". */
  slots: string[];
  /** Notion `Time`, e.g. "4:30 PM". */
  times: string[];
  location: string;
  sessions: string[];
  age: number | null;
  ageBand: string;
  /** Teacher only. Never printed. */
  levelUp: string;
  playlist: string;
  goalPiece: string;
  /** Notion `Repertoire`: the current piece as the tracker has it. */
  repertoire: string;
  fern: string;
  prescription: string[];
  sprint: string;
  creative: string;
  experience: string[];
  folder: string;
  lang: Lang;
  familyLang: Lang;
  accent: string;
  pointsMode: PointsMode;
  flags: string[];
  paBook: string;
  span15: number | null;
  span14: number | null;
  spanOn: string;
  adultName: string;
  /** The private family link token. Teacher only. */
  familyKey: string;
  familyKeyOn: string;
}

export type Outcome = "met" | "not yet" | "not tried" | "";

export interface Card {
  id: string;
  /** One of the fifteen, or empty until chosen. */
  code: CardCode | "";
  t: string;
  d: string;
  done: string;
  /** A retention check after a gap. */
  still: string;
  /** The date of the sheet this card first went home on, when it carries over. */
  carriedFrom: string;
  book: string;
  lane: Lane | "";
  /** The StudentChallenge it feeds. */
  feeds: string;
  /** A rung code, e.g. "T01". */
  rung: string;
  youPick: boolean;
  /** Set in the next lesson. */
  outcome: Outcome;
  outcomeOn: string;
}

export type RoutineKind = "warm-up" | "card block" | "keep-alive" | "free play" | "";

export interface RoutineItem {
  min: number;
  text: string;
  kind: RoutineKind;
  /** The card this block practises, if any. */
  card: string;
}

/** A code on the sheet: a URL, a URL with its label, or a resource id. */
export type QR = null | string | { url: string; label: string } | { id: string };

export interface AdultNote {
  t: string;
  d: string | string[];
}

/** One week's sheet: everything the records JSON carries, plus two teacher-only lines for Today. */
export interface Sheet {
  wins: string[];
  song: string;
  songNote: string;
  last: string;
  cards: Card[];
  routine: RoutineItem[];
  keep: { t: string; d: string };
  /** StudentChallenge ids for the block. */
  challenges: string[];
  chalNote: string;
  listen: boolean;
  /** Passed through to the generator untouched. */
  quiz: unknown;
  fig: string;
  figSong: string;
  figLabel: string;
  playlist: string;
  qrSong: QR;
  qr2: QR;
  qr3: QR;
  noqrText: string | null;
  adultNote: AdultNote | null;
  /** Teacher only: the day sheet's "Ask first, before you model". */
  askFirst: string;
  /** Teacher only: "Check before you teach". */
  checkFirst: string;
}

export const WEEK_STATUSES = ["draft", "verified", "printed", "handed out"] as const;
export type WeekStatus = (typeof WEEK_STATUSES)[number];

/** One coloured day box. A practice day counts once, whichever way it arrives. */
export interface Tick {
  card: string;
  day: number;
  on: string;
  source: "paper" | "app";
}

export interface FamilyNote {
  text: string;
  on: string;
}

export interface ListeningEntry {
  artist: string;
  track: string;
  noticed: string;
  steal: string;
  on: string;
}

export interface Week extends Base {
  student: string;
  /** The date printed on the sheet, YYYY-MM-DD. */
  date: string;
  status: WeekStatus;
  edition: number;
  builtFrom: "lesson" | "carried" | "";
  sheet: Sheet;
  ticks: Tick[];
  notes: FamilyNote[];
  listening: ListeningEntry[];
  /** "I think I've got it", per card: Reported until checked in the room. */
  gotIt: Record<string, string>;
  /** The last day the family page was opened. */
  seen: string;
}

export const LESSON_STATUSES = ["Transcript only", "Logged", "Report drafted", "Report posted"] as const;

/** What the lesson capture adds to a Notion Lessons row. */
export interface Capture {
  /** Comparatives only: "Approval is not improvement". */
  wins: string[];
  parentAsks: string[];
  notes: string[];
  /** Week id + card id: the outcome set in this lesson. */
  outcomes: { week: string; card: string; outcome: Outcome }[];
  recital: string;
}

export interface Lesson extends Base {
  name: string;
  date: string;
  student: string;
  location: string;
  status: string;
  whatChanged: string;
  evidence: string;
  assigned: string;
  unresolved: string;
  threads: string[];
  transcript: string;
  report: string;
  /** When the lesson was started from Today: the slot marker for the room recording. */
  startedAt: string;
  capture: Capture;
}

export const THREAD_KINDS = ["Technique", "Reading", "Rhythm", "Ear", "Repertoire", "Practice habit", "Motivation", "Family", "Logistics", "Studio system"] as const;
export const THREAD_STATUSES = ["Open", "Advancing", "Resolved", "Dropped", "Needs a decision"] as const;

export interface Thread extends Base {
  name: string;
  kind: string;
  status: string;
  student: string;
  watching: string;
  nextMove: string;
  opened: string;
  lastTouched: string;
  lessons: string[];
}

export const PROMISE_KINDS = ["arrangement", "printed score", "video on the playlist", "theory pages", "email with scores", "equipment", "other"] as const;
export const PROMISE_STATES = ["owed", "ongoing", "not confirmed", "kept"] as const;

export interface PromiseItem extends Base {
  what: string;
  student: string;
  kind: string;
  state: string;
  saidOn: string;
  recordingTime: string;
  keptOn: string;
  where: string;
}

/** A dated fact about a ladder: a rung's state, one Skills Check result, or a quiz. */
export interface Progress extends Base {
  student: string;
  rung: string;
  kind: "rung" | "skill" | "quiz";
  /** rung: "current" | "cleared" | "needs recheck"; skill: "Passed" | "Practise". */
  state: string;
  item: number | null;
  promptSet: "A" | "B" | "";
  mark: Mark;
  date: string;
  source: "lesson" | "game" | "family" | "import" | "";
  note: string;
}

export const CHALLENGE_STATES = ["open", "complete", "dropped"] as const;

export interface StudentChallenge extends Base {
  student: string;
  name: string;
  code: string;
  points: number | null;
  state: string;
  criterion: string;
  blocks: number;
  /** App packets ("250 Minutes ... App Packet") count minutes. */
  minutesGoal: number | null;
  openedOn: string;
  completedOn: string;
  inNotebook: boolean;
}

/** Minutes and results from a game, one row per student, game and day. Always Reported. */
export interface Practice extends Base {
  student: string;
  date: string;
  game: string;
  minutes: number;
  countsToward: string;
  summary: PracticeSummary;
  key: string;
}

export interface PracticeSummary {
  rounds: number;
  attempts: number;
  correct: number;
  /** "Five in a row" at a stated setting, e.g. "Subdivide 05, Read & tap". */
  fiveInARow: string[];
  slow: string[];
}

export const ROLES = ["NOW", "goal piece", "keep alive", "recital", "played already"] as const;
export const PIECE_STATUSES = ["starting", "in progress", "polishing", "achieved", "shelved"] as const;
export const SOUND = ["S", "O", "U", "N", "D"] as const;

export interface RepertoireItem extends Base {
  student: string;
  title: string;
  song: string;
  role: string;
  status: string;
  sound: string;
  startedOn: string;
  finishedOn: string;
  chosenHow: string;
  scoreLink: string;
}

export const REPORT_KINDS = ["full", "mini", "adult", "makeup note"] as const;
export const REPORT_STATES = ["drafted", "on hold", "posted"] as const;

export interface Report extends Base {
  student: string;
  name: string;
  kind: string;
  lang: Lang;
  state: string;
  lessons: string[];
  draftedOn: string;
  postedOn: string;
  body: string;
  fern: string;
  parentVerb: string;
}

/** The song bank (Notion Songs), read only. */
export interface Song extends Base {
  title: string;
  level: string;
  difficulty: string;
  link: string;
  notes: string;
}

/** Studio content: one rung of the R ladder, the theory book or Subdivide. Lives in Notion. */
export interface Rung extends Base {
  code: string;
  ladder: "R" | "T" | "Subdivide" | string;
  title: string;
  titleEs: string;
  doneWhen: string;
  doneWhenEs: string;
  /** Rung codes this one needs first (the routing graph). */
  needs: string[];
  /** Print order: what "Before this" and "Next" follow. */
  order: number;
  pages: number | null;
  link: string;
  soundSource: string;
  recordGrid: string;
  kind: string;
}

export interface SkillItem extends Base {
  rung: string;
  n: number;
  skill: string;
  show: string;
  pass: string;
  promptA: string;
  promptB: string;
  extra: boolean;
  wrongMeans: string;
}

/** A checked tool behind a code on the sheet. */
export interface Resource extends Base {
  key: string;
  label: string;
  url: string;
  what: string;
  cost: string;
  checked: string;
  teacherOnly: boolean;
}

export interface Collections {
  students: Student;
  weeks: Week;
  lessons: Lesson;
  threads: Thread;
  promises: PromiseItem;
  progress: Progress;
  challenges: StudentChallenge;
  practice: Practice;
  repertoire: RepertoireItem;
  reports: Report;
  songs: Song;
  rungs: Rung;
  skills: SkillItem;
  resources: Resource;
}

export type CollectionName = keyof Collections;

export const COLLECTION_NAMES: CollectionName[] = [
  "students",
  "weeks",
  "lessons",
  "threads",
  "promises",
  "progress",
  "challenges",
  "practice",
  "repertoire",
  "reports",
  "songs",
  "rungs",
  "skills",
  "resources",
];

/** One change waiting to reach Notion. */
export type Op =
  | { op: string; kind: "create"; collection: CollectionName; id: string; data: Record<string, unknown> }
  | { op: string; kind: "update"; collection: CollectionName; id: string; data: Record<string, unknown> }
  | { op: string; kind: "archive"; collection: CollectionName; id: string }
  | { op: string; kind: "tick"; collection: "weeks"; id: string; card: string; day: number; on: boolean; source: Tick["source"] }
  | { op: string; kind: "familyLink"; collection: "students"; id: string };

export interface OpResult {
  op: string;
  ok: boolean;
  /** The Notion id a "tmp_" record received. */
  id?: string;
  record?: Record<string, unknown>;
  error?: string;
}

/** What a family's link shows: one student's family-visible week and nothing else. */
export interface FamilyView {
  displayName: string;
  lang: Lang;
  accent: string;
  /** The week id, needed to tick a box or write back. */
  week: string;
  date: string;
  wins: string[];
  song: string;
  songNote: string;
  last: string;
  cards: {
    id: string;
    /** Category only ("LA"), and empty for students who do not play for points. */
    code: string;
    t: string;
    d: string;
    done: string;
    still: string;
    carried: string;
    book: string;
    youPick: boolean;
    gotIt: string;
  }[];
  routine: { min: number; text: string }[];
  keep: { t: string; d: string };
  /** Names and blocks only; never points. Empty for opt-outs. */
  challenges: { name: string; code: string; blocks: number }[];
  codes: { label: string; url: string }[];
  adultNote: AdultNote | null;
  ticks: { card: string; day: number }[];
  notes: FamilyNote[];
  listening: ListeningEntry[];
  /** The current sheets on each ladder, with only their two neighbours. */
  rungs: { ladder: string; title: string; doneWhen: string; before: string; next: string }[];
  /** True when there is no checked sheet yet. */
  empty: boolean;
}
