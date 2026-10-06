import { AGE_BANDS, CHALLENGE_STATES, FLAGS, POINTS_MODES, PROMISE_KINDS, PROMISE_STATES, REPORT_KINDS, REPORT_STATES, ROLES, PIECE_STATUSES, SOUND, WEEK_STATUSES, FERN, type CollectionName } from "../shared/types";

/**
 * How each record maps onto a Notion database. Students, Lessons, Threads and
 * Songs are the existing Student tracker databases, used as they are; the app
 * only adds the properties marked `add`. Every other database lives on a
 * "Bravissimo" page inside the tracker and is created by setup.
 */

export type FieldKind =
  | "title"
  | "text"
  | "number"
  | "select"
  | "multi"
  /** A multi-select used as a single value (FERN). */
  | "multiOne"
  | "date"
  | "datetime"
  | "checkbox"
  | "url"
  | "relation"
  | "relations"
  /** A list of short codes stored as comma-separated text. */
  | "list"
  /** Structured data stored as JSON text, split across rich-text chunks. */
  | "json";

export interface Field {
  key: string;
  prop: string;
  kind: FieldKind;
  options?: readonly string[];
  target?: CollectionName;
  /** On an existing database: a property the app adds. */
  add?: boolean;
  /** Never sent to the browser. */
  secret?: boolean;
  /** The browser may not change it through a plain update. */
  locked?: boolean;
}

export interface CollectionSpec {
  name: CollectionName;
  /** The database title in Notion. */
  db: string;
  existing: boolean;
  readOnly?: boolean;
  fields: Field[];
  /** A date property and window (days) for the default pull. */
  recent?: { prop: string; days: number };
  /** Values that default when Notion has none. */
  defaults: Record<string, unknown>;
  /** Extra read-only columns kept in step for reading the database in Notion. */
  mirrors?: { prop: string; kind: "text" | "number"; from: string; compute: (value: unknown) => string | number }[];
}

const LANGS = ["en", "es"] as const;

export const SPECS: Record<CollectionName, CollectionSpec> = {
  students: {
    name: "students",
    db: "Students",
    existing: true,
    fields: [
      { key: "name", prop: "Name", kind: "title" },
      { key: "status", prop: "Status", kind: "select" },
      { key: "slots", prop: "Slot", kind: "multi" },
      { key: "times", prop: "Time", kind: "multi" },
      { key: "location", prop: "Location", kind: "select" },
      { key: "sessions", prop: "Sessions", kind: "multi" },
      { key: "age", prop: "Age", kind: "number" },
      { key: "levelUp", prop: "Level Up", kind: "text" },
      { key: "playlist", prop: "Playlist", kind: "url" },
      { key: "goalPiece", prop: "Goal Piece", kind: "text" },
      { key: "repertoire", prop: "Repertoire", kind: "text" },
      { key: "fern", prop: "FERN Status", kind: "multiOne" },
      { key: "prescription", prop: "Practice Prescription", kind: "multi" },
      { key: "sprint", prop: "Current Goal (Sprint)", kind: "text" },
      { key: "creative", prop: "Creative Challenge", kind: "text" },
      { key: "experience", prop: "Experience level", kind: "multi" },
      { key: "folder", prop: "Folder", kind: "url" },
      { key: "displayName", prop: "Display name", kind: "text", add: true },
      { key: "lang", prop: "Language", kind: "select", options: LANGS, add: true },
      { key: "familyLang", prop: "Family language", kind: "select", options: LANGS, add: true },
      { key: "accent", prop: "Accent", kind: "text", add: true },
      { key: "pointsMode", prop: "Points", kind: "select", options: POINTS_MODES, add: true },
      { key: "flags", prop: "Flags", kind: "multi", options: FLAGS, add: true },
      { key: "ageBand", prop: "Age band", kind: "select", options: AGE_BANDS, add: true },
      { key: "paBook", prop: "PA book", kind: "select", options: ["Primer", "1", "2A", "2B", "3A", "3B", "4", "5"], add: true },
      { key: "span15", prop: "Span 1 to 5", kind: "number", add: true },
      { key: "span14", prop: "Span 1 to 4", kind: "number", add: true },
      { key: "spanOn", prop: "Span taken", kind: "date", add: true },
      { key: "adultName", prop: "Adult name", kind: "text", add: true },
      { key: "familyKey", prop: "Family key", kind: "text", add: true, locked: true },
      { key: "familyKeyOn", prop: "Family key set", kind: "date", add: true, locked: true },
    ],
    defaults: { lang: "en", familyLang: "en", pointsMode: "plays for points", accent: "", status: "Active" },
  },
  lessons: {
    name: "lessons",
    db: "Lessons",
    existing: true,
    recent: { prop: "Date", days: 180 },
    fields: [
      { key: "name", prop: "Name", kind: "title" },
      { key: "date", prop: "Date", kind: "date" },
      { key: "student", prop: "Student", kind: "relation", target: "students" },
      { key: "location", prop: "Location", kind: "select" },
      { key: "status", prop: "Status", kind: "select" },
      { key: "whatChanged", prop: "What changed", kind: "text" },
      { key: "evidence", prop: "Evidence", kind: "text" },
      { key: "assigned", prop: "Assigned", kind: "text" },
      { key: "unresolved", prop: "Unresolved", kind: "text" },
      { key: "threads", prop: "Threads", kind: "relations", target: "threads" },
      { key: "transcript", prop: "Transcript", kind: "url" },
      { key: "report", prop: "Report", kind: "url" },
      { key: "startedAt", prop: "Started at", kind: "datetime", add: true },
      { key: "capture", prop: "Capture", kind: "json", add: true },
    ],
    defaults: { capture: { wins: [], parentAsks: [], notes: [], outcomes: [], recital: "" } },
  },
  threads: {
    name: "threads",
    db: "Threads",
    existing: true,
    fields: [
      { key: "name", prop: "Name", kind: "title" },
      { key: "kind", prop: "Kind", kind: "select" },
      { key: "status", prop: "Status", kind: "select" },
      { key: "student", prop: "Student", kind: "relation", target: "students" },
      { key: "watching", prop: "What we are watching", kind: "text" },
      { key: "nextMove", prop: "Next move", kind: "text" },
      { key: "opened", prop: "Opened", kind: "date" },
      { key: "lastTouched", prop: "Last touched", kind: "date" },
      { key: "lessons", prop: "Lessons", kind: "relations", target: "lessons" },
    ],
    defaults: { status: "Open" },
  },
  songs: {
    name: "songs",
    db: "Songs",
    existing: true,
    readOnly: true,
    fields: [
      { key: "title", prop: "Song", kind: "title" },
      { key: "level", prop: "Level (1–10)", kind: "select" },
      { key: "difficulty", prop: "Difficulty", kind: "select" },
      { key: "link", prop: "Link", kind: "url" },
      { key: "notes", prop: "Notes", kind: "text" },
    ],
    defaults: {},
  },
  weeks: {
    name: "weeks",
    db: "Weeks",
    existing: false,
    recent: { prop: "Date", days: 120 },
    fields: [
      { key: "student", prop: "Student", kind: "relation", target: "students" },
      { key: "date", prop: "Date", kind: "date" },
      { key: "status", prop: "Status", kind: "select", options: WEEK_STATUSES },
      { key: "edition", prop: "Edition", kind: "number" },
      { key: "builtFrom", prop: "Built from", kind: "select", options: ["lesson", "carried"] },
      { key: "sheet", prop: "Sheet", kind: "json" },
      { key: "ticks", prop: "Ticks", kind: "json", locked: true },
      { key: "notes", prop: "Write to me", kind: "json", locked: true },
      { key: "listening", prop: "Listening", kind: "json", locked: true },
      { key: "gotIt", prop: "Got it", kind: "json", locked: true },
      { key: "seen", prop: "Seen", kind: "date", locked: true },
    ],
    mirrors: [
      { prop: "Song", kind: "text", from: "sheet", compute: (v) => String((v as { song?: string })?.song ?? "") },
      { prop: "Practice days", kind: "number", from: "ticks", compute: (v) => new Set(((v as { day: number }[]) ?? []).map((t) => t.day)).size },
    ],
    defaults: { status: "draft", edition: 1, builtFrom: "", ticks: [], notes: [], listening: [], gotIt: {}, seen: "" },
  },
  promises: {
    name: "promises",
    db: "Promises",
    existing: false,
    fields: [
      { key: "what", prop: "Name", kind: "title" },
      { key: "student", prop: "Student", kind: "relation", target: "students" },
      { key: "kind", prop: "Kind", kind: "select", options: PROMISE_KINDS },
      { key: "state", prop: "State", kind: "select", options: PROMISE_STATES },
      { key: "saidOn", prop: "Said on", kind: "date" },
      { key: "recordingTime", prop: "Recording time", kind: "text" },
      { key: "keptOn", prop: "Kept on", kind: "date" },
      { key: "where", prop: "Where", kind: "url" },
    ],
    defaults: { state: "owed", kind: "other" },
  },
  progress: {
    name: "progress",
    db: "Progress",
    existing: false,
    fields: [
      { key: "student", prop: "Student", kind: "relation", target: "students" },
      { key: "rung", prop: "Rung", kind: "text" },
      { key: "kind", prop: "Kind", kind: "select", options: ["rung", "skill", "quiz"] },
      { key: "state", prop: "State", kind: "select", options: ["current", "cleared", "needs recheck", "Passed", "Practice"] },
      { key: "item", prop: "Item", kind: "number" },
      { key: "promptSet", prop: "Prompt set", kind: "select", options: ["A", "B"] },
      { key: "mark", prop: "Mark", kind: "select", options: ["Verified", "Reported", "Unverified"] },
      { key: "date", prop: "Date", kind: "date" },
      { key: "source", prop: "Source", kind: "select", options: ["lesson", "game", "family", "import"] },
      { key: "note", prop: "Note", kind: "text" },
    ],
    defaults: { mark: "Verified", source: "lesson", promptSet: "" },
  },
  challenges: {
    name: "challenges",
    db: "Challenges",
    existing: false,
    fields: [
      { key: "name", prop: "Name", kind: "title" },
      { key: "student", prop: "Student", kind: "relation", target: "students" },
      { key: "code", prop: "Code", kind: "text" },
      { key: "points", prop: "Points", kind: "number" },
      { key: "state", prop: "State", kind: "select", options: CHALLENGE_STATES },
      { key: "criterion", prop: "Criterion", kind: "text" },
      { key: "blocks", prop: "Blocks", kind: "number" },
      { key: "minutesGoal", prop: "Minutes goal", kind: "number" },
      { key: "openedOn", prop: "Opened", kind: "date" },
      { key: "completedOn", prop: "Completed", kind: "date" },
      { key: "inNotebook", prop: "In notebook", kind: "checkbox" },
    ],
    defaults: { state: "open", blocks: 0, inNotebook: false },
  },
  practice: {
    name: "practice",
    db: "Practice",
    existing: false,
    recent: { prop: "Date", days: 120 },
    fields: [
      { key: "student", prop: "Student", kind: "relation", target: "students" },
      { key: "date", prop: "Date", kind: "date" },
      { key: "game", prop: "Game", kind: "select" },
      { key: "minutes", prop: "Minutes", kind: "number" },
      { key: "countsToward", prop: "Counts toward", kind: "text" },
      { key: "summary", prop: "Summary", kind: "json" },
      { key: "key", prop: "Key", kind: "text" },
    ],
    defaults: { minutes: 0, summary: { rounds: 0, attempts: 0, correct: 0, fiveInARow: [], slow: [] } },
  },
  repertoire: {
    name: "repertoire",
    db: "Repertoire",
    existing: false,
    fields: [
      { key: "title", prop: "Name", kind: "title" },
      { key: "student", prop: "Student", kind: "relation", target: "students" },
      { key: "song", prop: "Song", kind: "relation", target: "songs" },
      { key: "role", prop: "Role", kind: "select", options: ROLES },
      { key: "status", prop: "Status", kind: "select", options: PIECE_STATUSES },
      { key: "sound", prop: "SOUND", kind: "select", options: SOUND },
      { key: "startedOn", prop: "Started", kind: "date" },
      { key: "finishedOn", prop: "Finished", kind: "date" },
      { key: "chosenHow", prop: "Chosen how", kind: "text" },
      { key: "scoreLink", prop: "Score link", kind: "url" },
    ],
    defaults: { role: "NOW", status: "starting" },
  },
  reports: {
    name: "reports",
    db: "Reports",
    existing: false,
    fields: [
      { key: "name", prop: "Name", kind: "title" },
      { key: "student", prop: "Student", kind: "relation", target: "students" },
      { key: "kind", prop: "Kind", kind: "select", options: REPORT_KINDS },
      { key: "lang", prop: "Language", kind: "select", options: LANGS },
      { key: "state", prop: "State", kind: "select", options: REPORT_STATES },
      { key: "lessons", prop: "Lessons", kind: "relations", target: "lessons" },
      { key: "draftedOn", prop: "Drafted", kind: "date" },
      { key: "postedOn", prop: "Posted", kind: "date" },
      { key: "body", prop: "Body", kind: "text" },
      { key: "fern", prop: "FERN", kind: "select", options: FERN },
      { key: "parentVerb", prop: "Parent verb", kind: "text" },
    ],
    defaults: { kind: "full", lang: "en", state: "drafted" },
  },
  rungs: {
    name: "rungs",
    db: "Rungs",
    existing: false,
    fields: [
      { key: "code", prop: "Name", kind: "title" },
      { key: "ladder", prop: "Ladder", kind: "select", options: ["R", "T", "Subdivide"] },
      { key: "title", prop: "Title", kind: "text" },
      { key: "titleEs", prop: "Title ES", kind: "text" },
      { key: "doneWhen", prop: "Done when", kind: "text" },
      { key: "doneWhenEs", prop: "Done when ES", kind: "text" },
      { key: "needs", prop: "Needs", kind: "list" },
      { key: "order", prop: "Order", kind: "number" },
      { key: "pages", prop: "Pages", kind: "number" },
      { key: "link", prop: "Link", kind: "url" },
      { key: "soundSource", prop: "Sound source", kind: "text" },
      { key: "recordGrid", prop: "Record grid", kind: "text" },
      { key: "kind", prop: "Kind", kind: "select" },
    ],
    defaults: { order: 0, needs: [] },
  },
  skills: {
    name: "skills",
    db: "Skills Check",
    existing: false,
    fields: [
      { key: "rung", prop: "Rung", kind: "text" },
      { key: "n", prop: "Number", kind: "number" },
      { key: "skill", prop: "Skill", kind: "text" },
      { key: "show", prop: "How you show it", kind: "text" },
      { key: "pass", prop: "Pass mark", kind: "text" },
      { key: "promptA", prop: "Prompt A", kind: "text" },
      { key: "promptB", prop: "Prompt B", kind: "text" },
      { key: "extra", prop: "Extra credit", kind: "checkbox" },
      { key: "wrongMeans", prop: "Wrong answer means", kind: "text" },
    ],
    defaults: { extra: false, n: 0 },
  },
  resources: {
    name: "resources",
    db: "Resources",
    existing: false,
    fields: [
      { key: "key", prop: "Name", kind: "title" },
      { key: "label", prop: "Label", kind: "text" },
      { key: "url", prop: "URL", kind: "url" },
      { key: "what", prop: "What", kind: "text" },
      { key: "cost", prop: "Cost", kind: "select", options: ["free", "freemium", "paid", "in print"] },
      { key: "checked", prop: "Checked", kind: "date" },
      { key: "teacherOnly", prop: "Teacher only", kind: "checkbox" },
    ],
    defaults: { teacherOnly: false },
  },
};

/** The page in the tracker that holds the app's own databases. */
export const APP_PAGE_TITLE = "Bravissimo";

export function titleField(spec: CollectionSpec): Field | undefined {
  return spec.fields.find((f) => f.kind === "title");
}
