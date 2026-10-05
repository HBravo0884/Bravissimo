import { useSyncExternalStore } from "react";
import { emptyDB, newId, type Challenge, type DB, type Session, type Settings, type Student } from "./model";
import { POINTS_PER_LEVEL, LEVELS } from "./levelup";

export const STORAGE_KEY = "bravissimo.v1";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const now = () => new Date().toISOString();

/** Accepts anything that looks like a DB, filling gaps so older or partial files still load. */
export function normalizeDB(raw: unknown): DB {
  const base = emptyDB();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Partial<DB>;
  return {
    version: 1,
    students: Array.isArray(r.students)
      ? r.students.map((s) => ({
          ...s,
          levelUp: clampLevel(s.levelUp),
          pointsCarried: Number(s.pointsCarried) || 0,
          playsForPoints: s.playsForPoints !== false,
          color: Number(s.color) || 0,
          updatedAt: s.updatedAt ?? s.createdAt ?? now(),
        }))
      : [],
    sessions: Array.isArray(r.sessions) ? r.sessions.filter((s) => s && s.id && s.studentId) : [],
    challenges: Array.isArray(r.challenges) ? r.challenges.filter((c) => c && c.id && c.studentId) : [],
    settings: { ...base.settings, ...(r.settings ?? {}) },
  };
}

const clampLevel = (n: unknown) => Math.min(LEVELS, Math.max(1, Math.round(Number(n) || 1)));

/** Union by id. Sessions never change once saved; students and challenges keep the newer copy. */
export function mergeDB(into: DB, incoming: Partial<DB>): { db: DB; added: { students: number; sessions: number; challenges: number } } {
  const added = { students: 0, sessions: 0, challenges: 0 };
  const byNewer = <T extends { id: string; updatedAt: string }>(a: T[], b: T[] | undefined, key: keyof typeof added) => {
    const map = new Map(a.map((x) => [x.id, x]));
    for (const x of b ?? []) {
      const cur = map.get(x.id);
      if (!cur) {
        map.set(x.id, x);
        added[key]++;
      } else if ((x.updatedAt ?? "") > (cur.updatedAt ?? "")) map.set(x.id, x);
    }
    return [...map.values()];
  };
  const incomingNorm = normalizeDB({ ...incoming, settings: into.settings });
  const sessionIds = new Set(into.sessions.map((s) => s.id));
  const newSessions = incomingNorm.sessions.filter((s) => !sessionIds.has(s.id));
  added.sessions = newSessions.length;
  return {
    db: {
      ...into,
      students: byNewer(into.students, incomingNorm.students, "students"),
      sessions: [...into.sessions, ...newSessions].sort((a, b) => a.startedAt.localeCompare(b.startedAt)),
      challenges: byNewer(into.challenges, incomingNorm.challenges, "challenges"),
    },
    added,
  };
}

export function createStore(storage: StorageLike | null) {
  let db: DB = load();
  let saveError: string | null = null;
  const listeners = new Set<() => void>();

  function load(): DB {
    if (!storage) return emptyDB();
    try {
      const raw = storage.getItem(STORAGE_KEY);
      return raw ? normalizeDB(JSON.parse(raw)) : emptyDB();
    } catch {
      return emptyDB();
    }
  }

  function commit(next: DB) {
    db = next;
    if (storage) {
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify(db));
        saveError = null;
      } catch (e) {
        saveError = e instanceof Error ? e.message : "Could not save";
      }
    }
    listeners.forEach((l) => l());
  }

  const touchStudent = (id: string, patch: Partial<Student>) =>
    commit({ ...db, students: db.students.map((s) => (s.id === id ? { ...s, ...patch, updatedAt: now() } : s)) });

  const touchChallenge = (id: string, patch: Partial<Challenge>) =>
    commit({ ...db, challenges: db.challenges.map((c) => (c.id === id ? { ...c, ...patch, updatedAt: now() } : c)) });

  return {
    get: () => db,
    saveError: () => saveError,
    subscribe(l: () => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    /** Re-read storage, e.g. after another tab saved. */
    reload() {
      db = load();
      listeners.forEach((l) => l());
    },

    addStudent(input: { name: string; color?: number; levelUp?: number; pointsCarried?: number; playsForPoints?: boolean; id?: string }): Student {
      const s: Student = {
        id: input.id ?? newId(),
        name: input.name.trim(),
        color: input.color ?? db.students.length % 8,
        createdAt: now(),
        updatedAt: now(),
        levelUp: clampLevel(input.levelUp ?? 1),
        pointsCarried: Math.max(0, Math.round(input.pointsCarried ?? 0)),
        playsForPoints: input.playsForPoints ?? true,
      };
      commit({ ...db, students: [...db.students, s] });
      return s;
    },
    updateStudent: (id: string, patch: Partial<Omit<Student, "id" | "createdAt">>) => touchStudent(id, patch),
    deleteStudent(id: string) {
      commit({
        ...db,
        students: db.students.filter((s) => s.id !== id),
        sessions: db.sessions.filter((s) => s.studentId !== id),
        challenges: db.challenges.filter((c) => c.studentId !== id),
        settings: db.settings.homeStudentId === id ? { ...db.settings, homeStudentId: undefined } : db.settings,
      });
    },

    recordSession(s: Omit<Session, "id">): Session {
      const full: Session = { ...s, id: newId() };
      commit({ ...db, sessions: [...db.sessions, full] });
      return full;
    },
    deleteSession: (id: string) => commit({ ...db, sessions: db.sessions.filter((s) => s.id !== id) }),

    addChallenge(c: Omit<Challenge, "id" | "assignedAt" | "updatedAt"> & { assignedAt?: string }): Challenge {
      const full: Challenge = { ...c, id: newId(), assignedAt: c.assignedAt ?? now(), updatedAt: now() };
      commit({ ...db, challenges: [...db.challenges, full] });
      return full;
    },
    updateChallenge: (id: string, patch: Partial<Challenge>) => touchChallenge(id, patch),
    completeChallenge(id: string) {
      const c = db.challenges.find((x) => x.id === id);
      const s = c && db.students.find((x) => x.id === c.studentId);
      if (!c || !s) return;
      touchChallenge(id, { completedAt: now(), completedAtLevel: s.levelUp });
    },
    reopenChallenge: (id: string) => touchChallenge(id, { completedAt: undefined, completedAtLevel: undefined }),
    deleteChallenge: (id: string) => commit({ ...db, challenges: db.challenges.filter((c) => c.id !== id) }),

    /** Moves a student up one level, carrying any points past 1,000 into the new level. */
    levelUp(studentId: string, earnedAtLevel: number) {
      const s = db.students.find((x) => x.id === studentId);
      if (!s || s.levelUp >= LEVELS) return;
      touchStudent(studentId, { levelUp: s.levelUp + 1, pointsCarried: Math.max(0, earnedAtLevel - POINTS_PER_LEVEL) });
    },

    updateSettings: (patch: Partial<Settings>) => commit({ ...db, settings: { ...db.settings, ...patch } }),

    importData(incoming: Partial<DB>) {
      const { db: next, added } = mergeDB(db, incoming);
      commit(next);
      return added;
    },
    replaceAll: (next: DB) => commit(normalizeDB(next)),
  };
}

export type Store = ReturnType<typeof createStore>;

function browserStorage(): StorageLike | null {
  try {
    const ls = window.localStorage;
    const probe = "__bravissimo_probe__";
    ls.setItem(probe, "1");
    ls.removeItem(probe);
    return ls;
  } catch {
    return null;
  }
}

export const store = createStore(typeof window === "undefined" ? null : browserStorage());

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY) store.reload();
  });
}

/** Subscribe a component to part of the database. Selectors should return stable references. */
export function useDB<T>(select: (db: DB) => T): T {
  return useSyncExternalStore(store.subscribe, () => select(store.get()), () => select(store.get()));
}
