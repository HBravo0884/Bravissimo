import { FLASH_GAMES } from "../games/flash";
import { seededRng } from "../games/scoring";
import { RHYTHM_LEVELS } from "../music/rhythm";
import { emptyDB, newId, type Challenge, type DB, type GameId, type ItemStat, type Session, type Student } from "./model";

/**
 * A made-up studio for trying the app. Every name here is fictional; real
 * student data only ever lives on the teacher's devices, never in the code.
 */
const DEMO_STUDENTS: { name: string; level: number; carried: number; skill: number; habit: number; points?: boolean }[] = [
  { name: "Zoe Park", level: 2, carried: 620, skill: 0.92, habit: 0.8 },
  { name: "Diego Alvarez", level: 1, carried: 240, skill: 0.7, habit: 0.55 },
  { name: "Priya Nair", level: 3, carried: 910, skill: 0.95, habit: 0.9 },
  { name: "Sam Okafor", level: 1, carried: 80, skill: 0.6, habit: 0.35 },
  { name: "Nora Lindqvist", level: 2, carried: 450, skill: 0.85, habit: 0.6, points: false },
  { name: "Isaac Chen", level: 4, carried: 300, skill: 0.88, habit: 0.7 },
  { name: "Maya Brooks", level: 1, carried: 0, skill: 0.75, habit: 0.15 },
  { name: "Owen Reyes", level: 2, carried: 700, skill: 0.8, habit: 0.65 },
];

export function buildDemoStudio(now = new Date(), seed = 7): DB {
  const rng = seededRng(seed);
  const db = emptyDB();
  const day = 86_400_000;

  DEMO_STUDENTS.forEach((d, idx) => {
    const created = new Date(now.getTime() - 40 * day).toISOString();
    const student: Student = {
      id: newId(),
      name: d.name,
      color: idx % 8,
      createdAt: created,
      updatedAt: created,
      levelUp: d.level,
      pointsCarried: d.carried,
      playsForPoints: d.points !== false,
    };
    db.students.push(student);

    // A month of practice, more often for students with a stronger habit, improving slowly.
    const quietTail = d.habit < 0.3 ? 9 : 0;
    for (let back = 30; back >= quietTail; back--) {
      if (rng() > d.habit) continue;
      const games = 1 + Math.floor(rng() * 2.4);
      for (let g = 0; g < games; g++) {
        const progress = (30 - back) / 30;
        db.sessions.push(fakeSession(student.id, now.getTime() - back * day + (17 + g) * 3_600_000, d.skill + progress * 0.06, d.level, rng));
      }
    }

    const assigned = new Date(now.getTime() - 21 * day).toISOString();
    const challenge = (c: Omit<Challenge, "id" | "studentId" | "assignedAt" | "updatedAt">): Challenge => ({
      ...c,
      id: newId(),
      studentId: student.id,
      assignedAt: assigned,
      updatedAt: assigned,
    });
    db.challenges.push(challenge({ code: "ET 1b", title: "250 minutes on an ear training app", points: 100, minutes: 250, feeds: ["rhythm", "intervals"] }));
    db.challenges.push(challenge({ code: "PP 1c", title: "Master one current-level piece", points: 90 }));
    if (idx % 2 === 0) {
      db.challenges.push(
        challenge({ code: "CH 1a", title: "Broken major triads, seven keys, hands separately", points: 40, completedAt: new Date(now.getTime() - 6 * day).toISOString(), completedAtLevel: d.level }),
      );
    }
  });
  db.sessions.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  return db;
}

function fakeSession(studentId: string, at: number, skill: number, level: number, rng: () => number): Omit<Session, "id"> & { id: string } {
  const gameRoll = rng();
  const game: GameId = gameRoll < 0.5 ? "notes" : gameRoll < 0.72 ? "rhythm" : gameRoll < 0.88 ? "intervals" : "keys";
  const p = Math.max(0.35, Math.min(0.99, skill + (rng() - 0.5) * 0.12));
  const items: Record<string, ItemStat> = {};
  let correct = 0;
  let attempts = 0;
  let streak = 0;
  let best = 0;
  let score = 0;
  let totalMs = 0;

  let stage = 0;
  let variant = "treble";
  let pool: string[];
  if (game === "rhythm") {
    stage = Math.min(RHYTHM_LEVELS.length - 1, Math.floor(rng() * (level + 3)));
    variant = ["match", "read", "echo"][Math.floor(rng() * 3)];
    pool = [`rung:${stage}:${variant}`];
  } else {
    const fg = FLASH_GAMES[game];
    stage = Math.min(fg.stages.length - 1, Math.floor(rng() * Math.min(fg.stages.length, level + 1)));
    variant = fg.variants[Math.floor(rng() * fg.variants.length)].id;
    pool = fg.pool(stage, variant);
  }

  const n = game === "rhythm" ? 10 : 18 + Math.floor(rng() * 16);
  for (let i = 0; i < n; i++) {
    const item = pool[Math.floor(rng() * pool.length)];
    // Ledger-line notes and bigger intervals are harder.
    const hard = /:(A3|B3|A5|B5|C6|C2|D2|E4)$|int:[678]/.test(item) ? 0.15 : 0;
    const ok = rng() < p - hard;
    const ms = game === "rhythm" ? 0 : Math.round(900 + (1 - p) * 2600 + rng() * 900);
    const cur = items[item] ?? [0, 0, 0];
    items[item] = [cur[0] + (ok ? 1 : 0), cur[1] + 1, cur[2] + ms];
    attempts++;
    totalMs += ms;
    if (ok) {
      correct++;
      streak++;
      best = Math.max(best, streak);
      score += (10 + (game === "rhythm" ? 5 : Math.max(0, Math.round((4000 - ms) / 320)))) * Math.min(4, 1 + Math.floor(streak / 5));
    } else streak = 0;
  }
  const format = game === "rhythm" || rng() < 0.35 ? "steady" : "sprint";
  return {
    id: newId(),
    studentId,
    game,
    stage,
    variant,
    format,
    startedAt: new Date(at).toISOString(),
    durationMs: format === "sprint" ? 60_000 : Math.round(n * (game === "rhythm" ? 14_000 : 3_500)),
    score,
    correct,
    attempts,
    bestStreak: best,
    avgMs: game === "rhythm" ? 0 : Math.round(totalMs / attempts),
    items,
    ...(game === "rhythm" ? { bpm: 76, timingMs: Math.round(30 + (1 - p) * 90), cleared: best >= 5 ? [stage] : [] } : {}),
    device: rng() < 0.6 ? "home" : "studio",
  };
}
