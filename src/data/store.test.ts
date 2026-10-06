import { beforeEach, describe, expect, it } from "vitest";
import { createStore, type Fetcher, type StorageLike } from "./store";
import { handle, resetCaches, type Env } from "../../server/api";
import { fakeTracker, type FakeNotion } from "../../server/fakeNotion";
import { blankWeek } from "../../shared/records";

/** The whole path in one test: the app's store, the Netlify function, and a stand-in for Notion. */

const KEY = "studio-key-for-tests";

function memoryStorage(): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
}

let notion: FakeNotion;
let ids: ReturnType<typeof fakeTracker>;
let env: Env;
let offline = false;

const fetcher: Fetcher = async (path, init) => {
  if (offline) throw new TypeError("fetch failed");
  const res = await handle(
    new Request(`https://bravissimo.test/api${path}`, {
      method: init.method,
      headers: { "Content-Type": "application/json", ...(init.key ? { "x-studio-key": init.key } : {}) },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    }),
    env,
    { fetch: notion.fetch, now: () => notion.clock },
  );
  return { status: res.status, body: await res.json() };
};

async function settle(store: ReturnType<typeof createStore>) {
  for (let i = 0; i < 20 && store.get().sync.pending; i++) await store.flush();
}

beforeEach(async () => {
  resetCaches();
  offline = false;
  ids = fakeTracker();
  notion = ids.notion;
  env = { NOTION_TOKEN: "secret", NOTION_ROOT_PAGE: ids.root, STUDIO_KEY: KEY };
  await fetcher("/setup", { method: "POST", key: KEY });
});

describe("syncing with Notion", () => {
  it("signs in, pulls the tracker, and keeps working offline until the connection comes back", async () => {
    const sid = notion.addRow(ids.students, { Name: "Student A Example", Status: "Active", Slot: ["Monday 4"], Time: ["4:30 PM"] });
    const store = createStore(memoryStorage(), fetcher);
    expect(store.get().sync.mode).toBe("demo");
    store.connect("notion", KEY);
    await store.pull();
    expect(store.data().students.map((s) => s.name)).toEqual(["Student A Example"]);

    // In the room with no signal: everything still lands on the device.
    offline = true;
    const { id: _ignore, ...w } = blankWeek(sid, "2026-10-05");
    void _ignore;
    const week = store.create("weeks", w, "Student A, Oct 5");
    const challenge = store.create("challenges", { student: sid, name: "100 Practices Completed Packet", code: "PR 1a", points: 100, state: "open", criterion: "", blocks: 0, minutesGoal: null, openedOn: "2026-10-05", completedOn: "", inNotebook: false });
    store.update("weeks", week.id, { sheet: { ...week.sheet, song: "Ode to Joy", challenges: [challenge.id] } });
    await store.flush();
    expect(store.get().sync.status).toBe("offline");
    // The sheet edit may fold into the waiting create or follow it; either way nothing is lost.
    expect(store.get().sync.pending).toBeGreaterThanOrEqual(2);
    expect(week.id.startsWith("tmp_")).toBe(true);

    // Back online: the challenge goes first, the sheet follows with the challenge's real id.
    offline = false;
    await settle(store);
    expect(store.get().sync.pending).toBe(0);
    const w2 = store.data().weeks[0];
    const c2 = store.data().challenges[0];
    expect(w2.id.startsWith("tmp_")).toBe(false);
    expect(c2.id.startsWith("tmp_")).toBe(false);
    expect(w2.sheet.challenges).toEqual([c2.id]);
    const page = notion.pages.get(w2.id)!;
    expect(JSON.parse((page.properties.Sheet.rich_text as { plain_text: string }[]).map((r) => r.plain_text).join("")).challenges).toEqual([c2.id]);
  });

  it("brings back a family's tick without losing an edit made on this device", async () => {
    const sid = notion.addRow(ids.students, { Name: "Student A Example", Status: "Active" });
    const store = createStore(memoryStorage(), fetcher);
    store.connect("notion", KEY);
    await store.pull();
    const { id: _x, ...w } = blankWeek(sid, "2026-10-05");
    void _x;
    store.create("weeks", { ...w, status: "verified" }, "A");
    await settle(store);
    const week = store.data().weeks[0];
    const card = week.sheet.cards[0].id;

    // The family ticks a box on their phone...
    const link = await fetcher("/push", { method: "POST", key: KEY, body: { ops: [{ op: "l", kind: "familyLink", collection: "students", id: sid }] } });
    const token = ((link.body as { results: { record: { familyKey: string } }[] }).results[0].record.familyKey);
    notion.tick(5);
    const ticked = await handle(new Request("https://bravissimo.test/api/family", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ k: token, action: "tick", week: week.id, card, day: 2, on: true }) }), env, { fetch: notion.fetch, now: () => notion.clock });
    expect(ticked.status).toBe(200);

    // ...while the teacher edits the sheet here. Neither loses the other.
    store.update("weeks", week.id, { sheet: { ...week.sheet, song: "Minuet in G" } });
    await settle(store);
    notion.tick(5);
    await store.pullLive();
    const after = store.data().weeks[0];
    expect(after.sheet.song).toBe("Minuet in G");
    expect(after.ticks.map((t) => [t.card, t.day])).toEqual([[card, 2]]);
  });

  it("asks to sign in again when the key is wrong", async () => {
    const store = createStore(memoryStorage(), fetcher);
    store.connect("notion", "wrong");
    await store.pull();
    expect(store.get().sync.status).toBe("signed out");
  });

  it("keeps the demo studio on the device and never calls the server", async () => {
    let called = 0;
    const store = createStore(memoryStorage(), async (...a) => {
      called++;
      return fetcher(...a);
    });
    expect(store.data().students.length).toBeGreaterThan(0);
    store.update("students", store.data().students[0].id, { displayName: "Changed" });
    await store.flush();
    await store.pull();
    expect(called).toBe(0);
    expect(store.get().sync.pending).toBe(0);
  });
});
