import { describe, expect, it } from "vitest";
import { createStore, mergeDB, type StorageLike } from "./store";
import { emptyDB, type Session } from "./model";
import { formatChallengeCode, parseChallengeCode, validPointValue } from "./levelup";
import { challengeMinutes, pointsAtLevel, practiceStreak, readyToLevelUp, weakestItems } from "./stats";
import { multiplier, pickItem, pointsFor, seededRng, speedBonus } from "../games/scoring";
import { FLASH_GAMES, landmarkHint } from "../games/flash";
import { parsePitch } from "../music/pitch";
import { buildDemoStudio } from "./demo";

function memoryStorage(): StorageLike & { data: Record<string, string> } {
  const data: Record<string, string> = {};
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
}

const session = (studentId: string, startedAt: string, extra: Partial<Session> = {}): Omit<Session, "id"> => ({
  studentId,
  game: "notes",
  stage: 0,
  variant: "treble",
  format: "sprint",
  startedAt,
  durationMs: 60_000,
  score: 100,
  correct: 9,
  attempts: 10,
  bestStreak: 5,
  avgMs: 1200,
  items: {},
  ...extra,
});

describe("Level Up codes", () => {
  it("reads the notebook's spellings", () => {
    expect(parseChallengeCode("ET 1b")).toEqual({ category: "ET", level: 1, item: "b" });
    expect(parseChallengeCode("Sc2E")).toEqual({ category: "SC", level: 2, item: "e" });
    expect(parseChallengeCode("pp 10a")?.level).toBe(10);
    expect(parseChallengeCode("XX 1a")).toBeNull();
    expect(formatChallengeCode("ch2E")).toBe("CH 2e");
  });

  it("keeps point values in the booklet's band", () => {
    expect(validPointValue(40)).toBe(true);
    expect(validPointValue(150)).toBe(true);
    expect(validPointValue(35)).toBe(false);
    expect(validPointValue(160)).toBe(false);
    expect(validPointValue(95)).toBe(false);
  });
});

describe("store", () => {
  it("persists, completes challenges and levels up with carry-over", () => {
    const storage = memoryStorage();
    const store = createStore(storage);
    const s = store.addStudent({ name: "Test Student", levelUp: 1, pointsCarried: 950 });
    const c = store.addChallenge({ studentId: s.id, code: "CH 1a", title: "Triads", points: 100 });
    expect(readyToLevelUp(store.get().students[0], store.get().challenges)).toBe(false);
    store.completeChallenge(c.id);
    expect(pointsAtLevel(store.get().students[0], store.get().challenges)).toBe(1050);
    store.levelUp(s.id, 1050);
    const after = store.get().students[0];
    expect(after.levelUp).toBe(2);
    expect(pointsAtLevel(after, store.get().challenges)).toBe(50); // overflow carried, old challenge stays at level 1

    const reloaded = createStore(storage);
    expect(reloaded.get().students[0].levelUp).toBe(2);
  });

  it("merges imports without duplicating games", () => {
    const db = emptyDB();
    const first = mergeDB(db, { students: [{ id: "a", name: "A", color: 0, createdAt: "x", updatedAt: "1", levelUp: 1, pointsCarried: 0, playsForPoints: true }], sessions: [{ ...session("a", "2026-10-01T10:00:00Z"), id: "s1" }] });
    expect(first.added).toEqual({ students: 1, sessions: 1, challenges: 0 });
    const again = mergeDB(first.db, { sessions: [{ ...session("a", "2026-10-01T10:00:00Z"), id: "s1" }, { ...session("a", "2026-10-02T10:00:00Z"), id: "s2" }] });
    expect(again.added.sessions).toBe(1);
    expect(again.db.sessions).toHaveLength(2);
  });
});

describe("stats", () => {
  it("counts a streak that is still alive from yesterday", () => {
    const today = new Date("2026-10-05T18:00:00");
    const days = ["2026-10-02T17:00:00", "2026-10-03T17:00:00", "2026-10-04T17:00:00"];
    const ss = days.map((d, i) => ({ ...session("a", new Date(d).toISOString()), id: String(i) }));
    const st = practiceStreak(ss, today);
    expect(st.current).toBe(3);
    expect(st.practicedToday).toBe(false);
    expect(st.longest).toBe(3);
  });

  it("feeds game minutes into a minutes challenge only after it was assigned", () => {
    const ch = { id: "c", studentId: "a", code: "ET 1b", title: "", points: 100, minutes: 250, feeds: ["rhythm" as const], assignedAt: "2026-10-01T00:00:00Z", updatedAt: "" };
    const ss = [
      { ...session("a", "2026-09-30T10:00:00Z", { game: "rhythm", durationMs: 600_000 }), id: "1" },
      { ...session("a", "2026-10-02T10:00:00Z", { game: "rhythm", durationMs: 300_000 }), id: "2" },
      { ...session("a", "2026-10-02T11:00:00Z", { game: "notes", durationMs: 300_000 }), id: "3" },
    ];
    expect(challengeMinutes(ch, ss)).toBe(5);
  });

  it("finds weak items worst first", () => {
    const weak = weakestItems({ "treble:E5": [1, 4, 0], "treble:C4": [10, 10, 0], "bass:G2": [2, 4, 0] });
    expect(weak.map((w) => w.item)).toEqual(["treble:E5", "bass:G2"]);
  });

  it("builds a demo studio that passes its own checks", () => {
    const db = buildDemoStudio(new Date("2026-10-05T12:00:00Z"));
    expect(db.students).toHaveLength(8);
    expect(db.sessions.length).toBeGreaterThan(50);
    expect(db.sessions.every((s) => s.correct <= s.attempts)).toBe(true);
  });
});

describe("scoring", () => {
  it("rewards streaks and speed", () => {
    expect(multiplier(1)).toBe(1);
    expect(multiplier(5)).toBe(2);
    expect(multiplier(30)).toBe(4);
    expect(speedBonus(500)).toBe(10);
    expect(speedBonus(5000)).toBe(0);
    expect(pointsFor(true, 10, 10)).toBe(60);
    expect(pointsFor(false, 0, 10)).toBe(0);
  });

  it("leans toward missed notes but never repeats the last one", () => {
    const rng = seededRng(11);
    const pool = ["treble:C4", "treble:D4", "treble:E4"];
    const stats = { "treble:C4": [20, 20, 20000], "treble:D4": [20, 20, 20000], "treble:E4": [2, 20, 60000] } as Record<string, [number, number, number]>;
    const counts: Record<string, number> = {};
    let recent: string[] = [];
    for (let i = 0; i < 600; i++) {
      const item = pickItem(pool, stats, recent, rng);
      expect(item).not.toBe(recent[recent.length - 1]);
      counts[item] = (counts[item] ?? 0) + 1;
      recent = [...recent.slice(-3), item];
    }
    expect(counts["treble:E4"]).toBeGreaterThan(counts["treble:C4"]);
  });
});

describe("games", () => {
  it("asks Note Rush questions whose answer is the note letter", () => {
    const q = FLASH_GAMES.notes.question("bass:F3", 1, "bass", Math.random);
    expect(q.answer).toBe("F");
    expect(q.explain).toContain("Bass F");
  });

  it("measures from the nearest landmark", () => {
    expect(landmarkHint(parsePitch("A4"), "treble")).toBe("That's A: one step above Treble G.");
    expect(landmarkHint(parsePitch("E4"), "treble")).toBe("That's E: a skip above Middle C.");
  });

  it("keeps interval questions inside the clef's range", () => {
    const rng = seededRng(5);
    for (let i = 0; i < 200; i++) {
      const q = FLASH_GAMES.intervals.question("int:8", 2, "bass", rng);
      expect(q.answer).toBe("8");
      expect(q.staff.notes).toHaveLength(2);
    }
  });
});
