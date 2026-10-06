import { describe, expect, it } from "vitest";
import { blankCard, blankSheet, blankWeek, copyForward, fromRecord, practiceDays, sheetProblems, toRecord, toggleTick, voiceProblems, packFileName } from "./records";
import { familyView } from "./family";
import { board, reportsDue } from "./board";
import { rungStates, skillResults, skillsCheckComplete, neighbours, readyRungs } from "./ladders";
import { blocksFromMinutes, formatChallengeCode, parseChallengeCode, validPoints } from "./levelup";
import { ordinal, longDate, nextWeekday } from "./dates";
import type { Card, Progress, Rung, Sheet, SkillItem, Student, StudentChallenge, Week } from "./types";

function student(over: Partial<Student> = {}): Student {
  return {
    id: "s1",
    name: "Student A Example",
    displayName: "",
    status: "Active",
    slots: ["Monday 4"],
    times: ["4:30 PM"],
    location: "Annandale",
    sessions: ["30"],
    age: 9,
    ageBand: "8 to 10",
    levelUp: "2",
    playlist: "https://www.youtube.com/playlist?list=EXAMPLE_ID_123",
    goalPiece: "",
    repertoire: "",
    fern: "Notes",
    prescription: [],
    sprint: "",
    creative: "",
    experience: [],
    folder: "",
    lang: "en",
    familyLang: "en",
    accent: "#1C7294",
    pointsMode: "plays for points",
    flags: [],
    paBook: "",
    span15: null,
    span14: null,
    spanOn: "",
    adultName: "",
    familyKey: "k".repeat(24),
    familyKeyOn: "",
    ...over,
  };
}

function card(code: Card["code"], t: string, over: Partial<Card> = {}): Card {
  return { ...blankCard(), code, t, d: "Bars 1 to 4, right hand, thumb on C.", done: "Bars 1 to 4 with no stop, twice in a row.", ...over };
}

function goodSheet(over: Partial<Sheet> = {}): Sheet {
  return {
    ...blankSheet(),
    song: "Ode to Joy, method-book arrangement",
    songNote: "Right hand alone first, then left, then both. Slow is the fast way here.",
    last: "Last time: we found the five-finger position for the opening.",
    wins: ["The opening line went through twice without a stop."],
    cards: [card("PP", "The opening line"), card("ML", "Name the notes first", { carriedFrom: "2026-09-21" }), card("ET", "Tap it back"), card("IC", "Your answer phrase")],
    routine: [
      { min: 5, text: "five-finger pattern in C, each hand", kind: "warm-up", card: "" },
      { min: 10, text: "the opening line", kind: "card block", card: "" },
      { min: 5, text: "note names", kind: "card block", card: "" },
      { min: 5, text: "tap it back", kind: "card block", card: "" },
      { min: 5, text: "free play", kind: "free play", card: "" },
    ],
    keep: { t: "Your first piece", d: "Once through, any day this week." },
    challenges: ["c1", "c2"],
    fig: "cmaj5",
    figSong: "Ode to Joy",
    qrSong: { url: "https://drive.google.com/EXAMPLE", label: "Music" },
    qr2: { id: "rhythm_trainer" },
    ...over,
  };
}

const challenges: StudentChallenge[] = [
  { id: "c1", student: "s1", name: "100 Practices Completed Packet", code: "PR 2a", points: 100, state: "open", criterion: "", blocks: 3, minutesGoal: null, openedOn: "", completedOn: "", inNotebook: false },
  { id: "c2", student: "s1", name: "250 Minutes Ear Training App Packet", code: "ET 2b", points: 100, state: "open", criterion: "", blocks: 1, minutesGoal: 250, openedOn: "", completedOn: "", inNotebook: false },
];

function week(over: Partial<Week> = {}): Week {
  return { ...blankWeek("s1", "2026-10-05"), id: "w1", sheet: goodSheet(), status: "verified", ...over };
}

describe("the records JSON", () => {
  it("writes exactly the keys the generator reads, with no level", () => {
    const r = toRecord(student(), week(), challenges, "Monday");
    expect(Object.keys(r)).toEqual([
      "name", "slot", "level", "accent", "lang", "wins", "song", "song_note", "last", "cards", "routine", "keep",
      "challenges", "chal_note", "playlist", "listen", "quiz", "fig", "fig_song", "fig_label", "qr_song", "qr2", "qr3", "noqr_text", "adult_note",
    ]);
    expect(r.name).toBe("Student");
    expect(r.slot).toBe("Monday 4:30, Annandale");
    expect(r.level).toBe("");
    expect(r.routine[0]).toBe("5 min five-finger pattern in C, each hand");
    expect(r.challenges).toEqual([
      ["100 Practices Completed Packet", "PR 2a", "100"],
      ["250 Minutes Ear Training App Packet", "ET 2b", "100"],
    ]);
    expect(r.cards.map((c) => c.code)).toEqual(["PP", "ML", "ET", "IC"]);
  });

  it("writes the carry-over tag into `still` in the sheet's language, unless there is a retention check", () => {
    const en = toRecord(student(), week(), challenges);
    expect(en.cards[1].still).toBe("Carried over from the 21st.");
    expect(en.cards[0].still).toBe("");
    const es = toRecord(student({ lang: "es" }), week(), challenges);
    expect(es.cards[1].still).toBe("viene de la hoja anterior");
    const still = week({ sheet: goodSheet({ cards: [card("PP", "A", { still: "You can still play bars 1 to 4 cold.", carriedFrom: "2026-09-21" }), card("ML", "B"), card("ET", "C"), card("IC", "D")] }) });
    expect(toRecord(student(), still, challenges).cards[0].still).toBe("You can still play bars 1 to 4 cold.");
  });

  it("gives an opt-out sheet no codes, no points and no challenges", () => {
    for (const mode of ["no points", "musical feedback instead"] as const) {
      const r = toRecord(student({ pointsMode: mode }), week({ sheet: goodSheet({ chalNote: "Keep going." }) }), challenges);
      expect(r.cards.every((c) => c.code === "")).toBe(true);
      expect(r.challenges).toEqual([]);
      expect(r.chal_note).toBe("");
    }
  });

  it("reads a records entry back without losing anything the sheet prints", () => {
    const r = toRecord(student(), week(), challenges);
    const back = fromRecord(r);
    expect(back.cards.map((c) => [c.code, c.t, c.done])).toEqual(r.cards.map((c) => [c.code, c.t, c.done]));
    expect(back.routine.map((x) => `${x.min} min ${x.text}`)).toEqual(r.routine);
    expect(back.qr2).toEqual({ id: "rhythm_trainer" });
  });

  it("names the pack the way the run does", () => {
    expect(packFileName("Monday", "2026-10-05")).toBe("students_monday05oct.json");
  });
});

describe("the build script's checks", () => {
  it("passes a good sheet", () => {
    expect(sheetProblems(goodSheet(), student()).filter((p) => p.level === "error")).toEqual([]);
  });

  it("refuses what the script refuses", () => {
    const texts = (s: Sheet) => sheetProblems(s, student()).filter((p) => p.level === "error").map((p) => `${p.where} ${p.text}`);
    expect(texts(goodSheet({ cards: goodSheet().cards.slice(0, 3) }))).toContain("Cards has 3 cards; a sheet has exactly four");
    expect(texts(goodSheet({ cards: [card("XX" as Card["code"], "A"), card("ML", "B"), card("ET", "C"), card("IC", "D")] }))).toContain("Card 1 code XX is not one of the fifteen");
    expect(texts(goodSheet({ routine: [...goodSheet().routine, { min: 3, text: "extra", kind: "", card: "" }] }))).toEqual(
      expect.arrayContaining(["Routine totals 33 minutes; it should be 15, 20, 25 or 30", "Routine line 6 is under five minutes"]),
    );
    expect(texts(goodSheet({ songNote: "Slow first — then faster." }))).toContain("Song note has a dash");
    expect(texts(goodSheet({ songNote: "Great work!" }))).toContain("Song note has an exclamation mark");
    expect(texts(goodSheet({ wins: ["Nice \u{1F3B9}"] }))).toContain("Win 1 has an emoji");
    expect(texts(goodSheet({ song: "Prelude, Level 2" }))).toContain("Song has the word Level; the build script refuses it");
  });

  it("allows hyphenated words but not a spaced hyphen used as a dash", () => {
    expect(voiceProblems("five-finger pattern", "x")).toEqual([]);
    expect(voiceProblems("slow - then fast", "x").map((p) => p.text)).toEqual(["has a dash"]);
  });

  it("lets a Done when wait for the teacher instead of inventing one", () => {
    const s = goodSheet({ cards: [card("PP", "A", { done: "" }), card("ML", "B"), card("ET", "C"), card("IC", "D")] });
    const p = sheetProblems(s, student()).find((x) => x.where === "Card 1");
    expect(p).toMatchObject({ level: "warn" });
  });
});

describe("copying a week forward", () => {
  const prev = week({
    date: "2026-09-28",
    sheet: goodSheet({ cards: [card("PP", "A", { outcome: "met" }), card("ML", "B", { carriedFrom: "2026-09-21" }), card("ET", "C", { outcome: "not yet" }), card("IC", "D")] }),
    ticks: [{ card: "x", day: 1, on: "2026-09-29", source: "paper" }],
  });

  it("keeps everything, dates the unfinished cards, and starts ticks and wins fresh", () => {
    const next = copyForward(prev, "2026-10-05", { lessonOnRecord: true, lang: "en" });
    expect(next.date).toBe("2026-10-05");
    expect(next.sheet.cards.map((c) => c.carriedFrom)).toEqual(["", "2026-09-21", "2026-09-28", "2026-09-28"]);
    expect(next.sheet.cards.every((c) => c.outcome === "")).toBe(true);
    expect(next.ticks).toEqual([]);
    expect(next.sheet.wins).toEqual([]);
    expect(next.sheet.keep).toEqual(prev.sheet.keep);
    expect(next.status).toBe("draft");
    expect(new Set(next.sheet.cards.map((c) => c.id)).size).toBe(4);
  });

  it("says so when the last lesson left no record", () => {
    expect(copyForward(prev, "2026-10-05", { lessonOnRecord: false, lastRecord: "2026-09-21", lang: "en" }).sheet.last).toBe(
      "Last week's cards carry over; my record of the 21st stops before your lesson. Cross off what is done.",
    );
    expect(copyForward(prev, "2026-10-05", { lessonOnRecord: false, lastRecord: "2026-09-21", lang: "es" }).sheet.last).toContain("mi registro del 21");
  });

  it("counts a practice day once, however many boxes were ticked that day", () => {
    let t = toggleTick([], "a", 2, true, "paper", "2026-10-06");
    t = toggleTick(t, "b", 2, true, "app", "2026-10-06");
    t = toggleTick(t, "b", 3, true, "app", "2026-10-07");
    expect(practiceDays(t)).toBe(2);
    expect(practiceDays(toggleTick(t, "b", 3, false, "app", "2026-10-07"))).toBe(1);
  });
});

const rungs: Rung[] = ["T00", "T01", "T02"].map((code, i) => ({ id: code, code, ladder: "T", title: `Sheet ${i}`, titleEs: `Hoja ${i}`, doneWhen: `Done ${i}`, doneWhenEs: "", needs: i ? [`T0${i - 1}`] : [], order: i, pages: null, link: "", soundSource: "", recordGrid: "", kind: "" }));
const prog = (rung: string, state: string, date: string, over: Partial<Progress> = {}): Progress => ({ id: `${rung}${state}${date}`, student: "s1", rung, kind: "rung", state, item: null, promptSet: "", mark: "Verified", date, source: "lesson", note: "", ...over });

describe("the family page", () => {
  it("shows nothing until the sheet is checked", () => {
    const v = familyView({ student: student(), week: week({ status: "draft" }), challenges, progress: [], rungs, resources: [] });
    expect(v.empty).toBe(true);
    expect(v.cards).toEqual([]);
  });

  it("shows the week, category-only challenge codes, blocks and no points", () => {
    const v = familyView({ student: student(), week: week(), challenges, progress: [prog("T01", "current", "2026-10-01")], rungs, resources: [{ id: "r", key: "rhythm_trainer", label: "The Rhythm Trainer", url: "https://www.therhythmtrainer.com/", what: "", cost: "free", checked: "", teacherOnly: false }] });
    expect(v.empty).toBe(false);
    expect(v.challenges).toEqual([
      { name: "100 Practices Completed Packet", code: "PR", blocks: 3 },
      { name: "250 Minutes Ear Training App Packet", code: "ET", blocks: 1 },
    ]);
    expect(v.codes.map((c) => c.label)).toEqual(["Playlist", "Music", "The Rhythm Trainer"]);
    expect(v.cards[1].carried).toBe("Carried over from the 21st.");
    expect(v.rungs).toEqual([{ ladder: "T", title: "Sheet 1", doneWhen: "Done 1", before: "Sheet 0", next: "Sheet 2" }]);
    const text = JSON.stringify(v);
    for (const banned of ["points", "levelUp", "Notes", "fern", "askFirst"]) expect(text).not.toContain(banned);
  });

  it("speaks Spanish to a Spanish-reading family", () => {
    const v = familyView({ student: student({ lang: "es" }), week: week(), challenges, progress: [prog("T01", "current", "2026-10-01")], rungs, resources: [] });
    expect(v.codes[0].label).toBe("Lista");
    expect(v.cards[1].carried).toBe("viene de la hoja anterior");
    expect(v.rungs[0].title).toBe("Hoja 1");
  });
});

describe("ladders and the Skills Check", () => {
  it("lets the latest dated fact win and keeps the clear date", () => {
    const s = rungStates([prog("T00", "current", "2026-09-01"), prog("T00", "cleared", "2026-09-20"), prog("T01", "current", "2026-09-20")], "s1");
    expect(s.get("T00")).toMatchObject({ state: "cleared", clearedOn: "2026-09-20" });
    expect(s.get("T01")?.state).toBe("current");
    expect(neighbours(rungs, "T01")).toMatchObject({ before: { code: "T00" }, next: { code: "T02" } });
    expect(readyRungs(rungs, s, "T").map((r) => r.code)).toEqual([]);
  });

  it("retests a missed box with the second prompt set and credits the sheet once every box passes", () => {
    const items: SkillItem[] = [1, 2].map((n) => ({ id: `i${n}`, rung: "T00", n, skill: `Skill ${n}`, show: "", pass: "3 of 3", promptA: "A", promptB: "B", extra: false, wrongMeans: "" }));
    const p1 = [prog("T00", "Passed", "2026-09-28", { kind: "skill", item: 1 }), prog("T00", "Practice", "2026-09-28", { kind: "skill", item: 2 })];
    const r1 = skillResults(p1, items, "s1", "T00");
    expect(r1.map((r) => [r.passed, r.retest])).toEqual([
      [true, false],
      [false, true],
    ]);
    expect(skillsCheckComplete(r1)).toBe(false);
    const r2 = skillResults([...p1, prog("T00", "Passed", "2026-10-05", { kind: "skill", item: 2, promptSet: "B" })], items, "s1", "T00");
    expect(skillsCheckComplete(r2)).toBe(true);
  });
});

describe("the board", () => {
  it("puts never reported first, then stale, then fresh, and flags what needs attention", () => {
    const a = student({ id: "a", name: "Ann Example" });
    const b = student({ id: "b", name: "Ben Example", pointsMode: "no points" });
    const c = student({ id: "c", name: "Cy Example" });
    const rows = board(
      {
        students: [a, b, c],
        weeks: [],
        lessons: [{ id: "l", name: "", date: "2026-10-01", student: "c", location: "", status: "", whatChanged: "", evidence: "", assigned: "", unresolved: "", threads: [], transcript: "", report: "", startedAt: "", capture: { wins: [], parentAsks: [], notes: [], outcomes: [], recital: "" } }],
        reports: [
          { id: "r1", student: "b", name: "", kind: "full", lang: "en", state: "posted", lessons: [], draftedOn: "", postedOn: "2026-05-01", body: "", fern: "", parentVerb: "" },
          { id: "r2", student: "c", name: "", kind: "full", lang: "en", state: "posted", lessons: [], draftedOn: "", postedOn: "2026-09-20", body: "", fern: "", parentVerb: "" },
        ],
        promises: [{ id: "p", what: "A score", student: "a", kind: "printed score", state: "owed", saidOn: "", recordingTime: "", keptOn: "", where: "" }],
        challenges: [],
        repertoire: [],
        threads: [],
      },
      "2026-10-05",
    );
    expect(rows.map((r) => [r.student.id, r.reportState])).toEqual([
      ["a", "never"],
      ["b", "stale"],
      ["c", "fresh"],
    ]);
    const keys = (id: string) => rows.find((r) => r.student.id === id)!.flags.map((f) => f.key);
    expect(keys("a")).toEqual(expect.arrayContaining(["promises", "nochallenge", "norecord"]));
    expect(keys("b")).not.toContain("nochallenge");
    expect(keys("c")).not.toContain("norecord");
  });

  it("puts the first full report after lesson 3", () => {
    const a = student({ id: "a" });
    const lesson = (d: string) => ({ id: d, name: "", date: d, student: "a", location: "", status: "", whatChanged: "", evidence: "", assigned: "", unresolved: "", threads: [], transcript: "", report: "", startedAt: "", capture: { wins: [], parentAsks: [], notes: [], outcomes: [], recital: "" } });
    const due = reportsDue({ students: [a], reports: [], lessons: ["2026-09-14", "2026-09-21", "2026-09-28"].map(lesson) }, "2026-10-05");
    expect(due[0].why).toBe("First full report, after lesson 3");
  });
});

describe("Level Up as a mapping", () => {
  it("reads the codes notebooks write and keeps custom challenges inside the rules", () => {
    expect(parseChallengeCode("sc2E")).toEqual({ category: "SC", level: 2, item: "e" });
    expect(formatChallengeCode("LA3a")).toBe("LA 3a");
    expect(parseChallengeCode("CR 1a")).toBeNull();
    expect([validPoints(40), validPoints(150), validPoints(35), validPoints(160)]).toEqual([true, true, false, false]);
    expect(blocksFromMinutes(124, 250)).toBe(4);
  });
});

describe("dates", () => {
  it("writes ordinals and dates the way the sheets do", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd"]);
    expect(longDate("2026-10-05")).toBe("Monday, October 5");
    expect(longDate("2026-10-05", "es")).toBe("lunes 5 de octubre");
    expect(nextWeekday("Thursday", "2026-10-05")).toBe("2026-10-08");
    expect(nextWeekday("Monday", "2026-10-05")).toBe("2026-10-05");
  });
});
