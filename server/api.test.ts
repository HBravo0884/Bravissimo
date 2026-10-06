import { beforeEach, describe, expect, it } from "vitest";
import { handle, resetCaches, type Env } from "./api";
import { fakeTracker, type FakeNotion } from "./fakeNotion";
import { blankSheet } from "../shared/records";
import type { FamilyView, Op, Sheet } from "../shared/types";

const KEY = "studio-key-for-tests";

let notion: FakeNotion;
let env: Env;
let ids: ReturnType<typeof fakeTracker>;

function call(method: string, path: string, body?: unknown, key: string | null = KEY) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (key) headers["x-studio-key"] = key;
  return handle(new Request(`https://bravissimo.test/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), env, {
    fetch: notion.fetch,
    now: () => notion.clock,
    random: (n) => new Uint8Array(n).map((_, i) => (i * 37 + 11) % 256),
  });
}

async function body<T = Record<string, unknown>>(r: Response | Promise<Response>): Promise<T> {
  return (await (await r).json()) as T;
}

async function push(ops: Op[]) {
  return body<{ results: { ok: boolean; id?: string; record?: Record<string, unknown>; error?: string }[] }>(call("POST", "/push", { ops }));
}

function sheetWith(overrides: Partial<Sheet> = {}): Sheet {
  const s = blankSheet();
  s.song = "Ode to Joy, method-book arrangement";
  s.cards = s.cards.map((c, i) => ({ ...c, id: `card${i + 1}`, code: (["PP", "ML", "ET", "IC"] as const)[i], t: `Card ${i + 1}`, d: "Bars 1 to 4.", done: "Twice in a row." }));
  s.routine = [
    { min: 5, text: "warm up", kind: "warm-up", card: "" },
    { min: 10, text: "the opening line", kind: "card block", card: "card1" },
    { min: 5, text: "free play", kind: "free play", card: "" },
  ];
  // Long enough to need more than one Notion text run.
  s.songNote = "Slow is the fast way here. ".repeat(120).trim();
  return { ...s, ...overrides };
}

beforeEach(() => {
  resetCaches();
  ids = fakeTracker();
  notion = ids.notion;
  env = { NOTION_TOKEN: "secret", NOTION_ROOT_PAGE: ids.root, STUDIO_KEY: KEY };
});

describe("the Notion function", () => {
  it("says whether it is configured, and refuses a wrong key", async () => {
    expect(await body(call("GET", "/status", undefined, null))).toEqual({ configured: true });
    expect((await call("GET", "/status", undefined, "nope")).status).toBe(401);
    env = {};
    expect(await body(call("GET", "/status", undefined, null))).toEqual({ configured: false });
    expect((await call("POST", "/pull", { collection: "students" })).status).toBe(503);
  });

  it("sets up the tracker by adding, never removing, and a second run changes nothing", async () => {
    const first = await body<{ created: string[]; addedProperties: string[]; problems: string[]; databases: Record<string, boolean> }>(call("POST", "/setup"));
    expect(first.problems).toEqual([]);
    expect(first.created).toEqual(["Bravissimo", "Weeks", "Promises", "Progress", "Challenges", "Practice", "Repertoire", "Reports", "Rungs", "Skills Check", "Resources"]);
    expect(first.addedProperties).toContain("Students: Display name");
    expect(first.addedProperties).toContain("Students: Family key");
    expect(first.addedProperties).toContain("Lessons: Capture");
    expect(Object.values(first.databases).every(Boolean)).toBe(true);
    // The tracker's own properties are untouched.
    expect(notion.dbs.get(ids.students)!.properties.Name.type).toBe("title");
    resetCaches();
    const second = await body<{ created: string[]; addedProperties: string[] }>(call("POST", "/setup"));
    expect(second.created).toEqual([]);
    expect(second.addedProperties).toEqual([]);
  });

  it("reads students with defaults, and writes a week whose sheet survives the round trip", async () => {
    await call("POST", "/setup");
    notion.addRow(ids.students, { Name: "Student A Example", Status: "Active", Slot: ["Monday 4"], Time: ["4:30 PM"], Location: "Annandale", "FERN Status": ["Notes"], Age: 9 });
    const pulled = await body<{ rows: Record<string, unknown>[] }>(call("POST", "/pull", { collection: "students" }));
    const s = pulled.rows[0];
    expect(s).toMatchObject({ name: "Student A Example", lang: "en", pointsMode: "plays for points", slots: ["Monday 4"], fern: "Notes", age: 9 });

    const sheet = sheetWith();
    const created = await push([{ op: "1", kind: "create", collection: "weeks", id: "tmp_1", data: { _title: "Student A, Oct 5", student: s.id, date: "2026-10-05", status: "draft", edition: 1, sheet } }]);
    expect(created.results[0].ok).toBe(true);
    const weekId = created.results[0].id!;
    expect(weekId).not.toMatch(/^tmp_/);
    const weeks = await body<{ rows: Record<string, unknown>[] }>(call("POST", "/pull", { collection: "weeks" }));
    expect(weeks.rows[0].sheet).toEqual(sheet);
    expect(notion.pages.get(weekId)!.properties.Song).toBeTruthy();

    // A plain update never overwrites what families write.
    await push([{ op: "2", kind: "tick", collection: "weeks", id: weekId, card: "card1", day: 2, on: true, source: "paper" }]);
    await push([{ op: "3", kind: "update", collection: "weeks", id: weekId, data: { status: "verified", ticks: [] } }]);
    const after = await body<{ rows: { ticks: unknown[]; status: string }[] }>(call("POST", "/pull", { collection: "weeks" }));
    expect(after.rows[0].status).toBe("verified");
    expect(after.rows[0].ticks).toHaveLength(1);
    expect((notion.pages.get(weekId)!.properties["Practice days"] as unknown as { number: number }).number).toBe(1);
  });

  it("pulls only what changed since the last pull", async () => {
    await call("POST", "/setup");
    const a = notion.addRow(ids.students, { Name: "Student A Example", Status: "Active" });
    notion.addRow(ids.students, { Name: "Student B Example", Status: "Active" });
    const first = await body<{ rows: unknown[]; at: string }>(call("POST", "/pull", { collection: "students" }));
    expect(first.rows).toHaveLength(2);
    notion.tick(30);
    await push([{ op: "1", kind: "update", collection: "students", id: a, data: { displayName: "A" } }]);
    const later = await body<{ rows: { displayName: string }[] }>(call("POST", "/pull", { collection: "students", since: notion.clock.toISOString() }));
    expect(later.rows.map((r) => r.displayName)).toEqual(["A"]);
  });

  it("keeps songs read only, and stops a batch at the first failure", async () => {
    await call("POST", "/setup");
    const r = await push([
      { op: "1", kind: "create", collection: "songs", id: "tmp_1", data: { title: "x" } },
      { op: "2", kind: "create", collection: "promises", id: "tmp_2", data: { what: "Print the score" } },
    ]);
    expect(r.results).toHaveLength(1);
    expect(r.results[0].ok).toBe(false);
  });

  it("adds a day's game minutes to one practice row", async () => {
    await call("POST", "/setup");
    const s = notion.addRow(ids.students, { Name: "Student A Example" });
    const data = (minutes: number) => ({ _title: "notes", student: s, date: "2026-10-05", game: "notes", minutes, key: `${s}|2026-10-05|notes`, summary: { rounds: 1, attempts: 10, correct: 9, fiveInARow: ["Treble C to G"], slow: [] } });
    await push([{ op: "1", kind: "create", collection: "practice", id: "tmp_1", data: data(3) }]);
    await push([{ op: "2", kind: "create", collection: "practice", id: "tmp_2", data: data(4.5) }]);
    const rows = await body<{ rows: { minutes: number; summary: { rounds: number; correct: number } }[] }>(call("POST", "/pull", { collection: "practice" }));
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].minutes).toBe(7.5);
    expect(rows.rows[0].summary).toMatchObject({ rounds: 2, correct: 18 });
  });
});

describe("the family link", () => {
  async function studentWithWeek(opts: { status?: string; points?: string } = {}) {
    await call("POST", "/setup");
    const s = notion.addRow(ids.students, { Name: "Student A Example", Status: "Active", "Level Up": "2", "FERN Status": ["Rhythm"] });
    if (opts.points) await push([{ op: "p", kind: "update", collection: "students", id: s, data: { pointsMode: opts.points } }]);
    const ch = await push([{ op: "c", kind: "create", collection: "challenges", id: "tmp_c", data: { name: "100 Practices Completed Packet", student: s, code: "PR 1a", points: 100, state: "open", blocks: 3 } }]);
    const sheet = sheetWith({ challenges: [ch.results[0].id!] });
    const w = await push([{ op: "w", kind: "create", collection: "weeks", id: "tmp_w", data: { _title: "A", student: s, date: "2026-10-05", status: opts.status ?? "draft", sheet } }]);
    const link = await push([{ op: "l", kind: "familyLink", collection: "students", id: s }]);
    const token = (link.results[0].record as { familyKey: string }).familyKey;
    return { s, week: w.results[0].id!, token };
  }

  it("makes a long random link and shows nothing until the sheet is checked", async () => {
    const { token } = await studentWithWeek();
    expect(token).toMatch(/^[A-Za-z0-9_-]{24}$/);
    const view = await body<FamilyView>(call("GET", `/family?k=${token}`, undefined, null));
    expect(view.empty).toBe(true);
    expect(view.cards).toEqual([]);
  });

  it("shows one family-visible week and never a level, a points value or a teacher field", async () => {
    const { token, week } = await studentWithWeek({ status: "verified" });
    const res = await call("GET", `/family?k=${token}`, undefined, null);
    const text = await res.clone().text();
    const view = (await res.json()) as FamilyView;
    expect(view.empty).toBe(false);
    expect(view.week).toBe(week);
    expect(view.cards.map((c) => c.code)).toEqual(["PP", "ML", "ET", "IC"]);
    expect(view.challenges).toEqual([{ name: "100 Practices Completed Packet", code: "PR", blocks: 3 }]);
    for (const secret of ["Level Up", "levelUp", "Rhythm", "familyKey", token, "points", "askFirst", "checkFirst"]) expect(text).not.toContain(secret);
  });

  it("hides codes and the challenges block for a student who does not play for points", async () => {
    const { token } = await studentWithWeek({ status: "printed", points: "no points" });
    const view = await body<FamilyView>(call("GET", `/family?k=${token}`, undefined, null));
    expect(view.cards.every((c) => c.code === "")).toBe(true);
    expect(view.challenges).toEqual([]);
  });

  it("takes a tick, a message and a listening entry, and only for its own week", async () => {
    const { token, week } = await studentWithWeek({ status: "handed out" });
    const tick = await body<{ ticks: unknown[] }>(call("POST", "/family", { k: token, action: "tick", week, card: "card2", day: 3, on: true }, null));
    expect(tick.ticks).toEqual([{ card: "card2", day: 3 }]);
    const wrote = await body<{ notes: { text: string }[] }>(call("POST", "/family", { k: token, action: "write", week, text: "Bar 6 was hard." }, null));
    expect(wrote.notes.map((n) => n.text)).toEqual(["Bar 6 was hard."]);
    const heard = await body<{ listening: { track: string }[] }>(call("POST", "/family", { k: token, action: "listen", week, entry: { artist: "A", track: "B", noticed: "C", steal: "D" } }, null));
    expect(heard.listening[0].track).toBe("B");
    expect((await call("POST", "/family", { k: token, action: "tick", week, card: "not-a-card", day: 3, on: true }, null)).status).toBe(400);

    const other = notion.addRow(ids.students, { Name: "Student B Example" });
    const theirs = await push([{ op: "x", kind: "create", collection: "weeks", id: "tmp_x", data: { student: other, date: "2026-10-05", status: "verified", sheet: sheetWith() } }]);
    expect((await call("POST", "/family", { k: token, action: "tick", week: theirs.results[0].id, card: "card1", day: 1, on: true }, null)).status).toBe(404);
  });

  it("refuses a link that is malformed, unknown, or reset", async () => {
    const { token, s } = await studentWithWeek({ status: "verified" });
    expect((await call("GET", "/family?k=short", undefined, null)).status).toBe(404);
    expect((await call("GET", `/family?k=${"x".repeat(24)}`, undefined, null)).status).toBe(404);
    // A reset replaces the token; the old link stops working.
    notion.tick(1);
    await handle(new Request("https://bravissimo.test/api/push", { method: "POST", headers: { "x-studio-key": KEY }, body: JSON.stringify({ ops: [{ op: "r", kind: "familyLink", collection: "students", id: s }] }) }), env, {
      fetch: notion.fetch,
      now: () => notion.clock,
      random: (n) => new Uint8Array(n).map((_, i) => (i * 53 + 7) % 256),
    });
    expect((await call("GET", `/family?k=${token}`, undefined, null)).status).toBe(404);
  });
});
