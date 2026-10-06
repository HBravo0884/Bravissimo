import { useSyncExternalStore } from "react";
import { COLLECTION_NAMES, type CollectionName, type Collections, type Op, type OpResult, type Tick } from "../../shared/types";
import { localId, toggleTick } from "../../shared/records";
import { isoDate } from "../../shared/dates";
import { demoData } from "./demo";

/**
 * The app's record, kept on this device and synced with Notion.
 *
 * Every change lands here first, so the room never waits on the network, and
 * goes into an outbox that the sync sends to the Notion function in order.
 * Pulls bring back what changed in Notion (the studio run, a family's tick,
 * an edit made in Notion itself). In demo mode nothing leaves the device.
 */

export type Data = { [K in CollectionName]: Collections[K][] };
export type Mode = "demo" | "notion";

export interface SyncState {
  mode: Mode;
  status: "idle" | "syncing" | "offline" | "error" | "signed out";
  message: string;
  pending: number;
  lastSync: string;
  /** A change Notion refused: what it was, and why. The rest of the outbox waits behind it. */
  failed: { op: string; collection: string; error: string } | null;
}

interface Persisted {
  data: Data;
  outbox: Op[];
  at: Partial<Record<CollectionName, string>>;
  fullAt: Partial<Record<CollectionName, string>>;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type Fetcher = (path: string, init: { method: string; body?: unknown; key: string }) => Promise<{ status: number; body: unknown }>;

const PREFS_KEY = "bravissimo.v2.connection";

export function emptyData(): Data {
  return Object.fromEntries(COLLECTION_NAMES.map((c) => [c, []])) as unknown as Data;
}

function dataKey(mode: Mode) {
  return `bravissimo.v2.${mode}`;
}

/** Collections that change often enough to re-check every minute. */
const LIVE: CollectionName[] = ["weeks", "lessons", "promises", "practice", "progress"];
/** Studio content and the song bank change rarely: a full pull once a day. */
const SLOW: CollectionName[] = ["songs", "rungs", "skills", "resources"];
const FULL_EVERY_MS = 12 * 60 * 60 * 1000;

export function createStore(storage: StorageLike | null, fetcher: Fetcher | null) {
  const conn = readConnection();
  let mode: Mode = conn.mode;
  let key = conn.key;
  let persisted: Persisted = load(mode);
  let sync: SyncState = { mode, status: mode === "notion" && !key ? "signed out" : "idle", message: "", pending: persisted.outbox.length, lastSync: "", failed: null };
  let snapshot = { data: persisted.data, sync };
  const listeners = new Set<() => void>();
  let saveError = "";
  let pulling = false;
  /** Ops on their way to the server: never fold a later edit into one of these. */
  let inflight = new Set<string>();

  function readConnection(): { mode: Mode; key: string } {
    try {
      const raw = storage?.getItem(PREFS_KEY);
      if (raw) {
        const c = JSON.parse(raw) as { mode?: Mode; key?: string };
        return { mode: c.mode === "notion" ? "notion" : "demo", key: c.key ?? "" };
      }
    } catch {
      /* fall through */
    }
    return { mode: "demo", key: "" };
  }

  function load(m: Mode): Persisted {
    const base: Persisted = { data: emptyData(), outbox: [], at: {}, fullAt: {} };
    try {
      const raw = storage?.getItem(dataKey(m));
      if (raw) {
        const p = JSON.parse(raw) as Partial<Persisted>;
        const data = emptyData();
        for (const c of COLLECTION_NAMES) if (Array.isArray(p.data?.[c])) (data[c] as unknown[]) = p.data![c] as unknown[];
        return { data, outbox: Array.isArray(p.outbox) ? p.outbox : [], at: p.at ?? {}, fullAt: p.fullAt ?? {} };
      }
    } catch {
      /* a damaged cache: start clean, Notion still has everything */
    }
    if (m === "demo") base.data = demoData();
    return base;
  }

  function save() {
    if (!storage) return;
    try {
      storage.setItem(dataKey(mode), JSON.stringify(persisted));
      saveError = "";
    } catch (e) {
      saveError = (e as Error).message || "storage is full";
    }
  }

  function emit() {
    sync = { ...sync, mode, pending: persisted.outbox.length };
    snapshot = { data: persisted.data, sync };
    for (const l of listeners) l();
  }

  function setData<K extends CollectionName>(c: K, rows: Collections[K][]) {
    persisted = { ...persisted, data: { ...persisted.data, [c]: rows } };
  }

  function setSync(patch: Partial<SyncState>) {
    sync = { ...sync, ...patch };
    emit();
  }

  // ------------------------------------------------------------ the outbox

  function enqueue(op: Op) {
    if (mode !== "notion") return;
    const outbox = [...persisted.outbox];
    const last = outbox.length ? outbox[outbox.length - 1] : undefined;
    // Fold an edit into the change still waiting for the same record.
    if (op.kind === "update") {
      for (let i = outbox.length - 1; i >= 0; i--) {
        const o = outbox[i];
        if (o.id !== op.id || o.collection !== op.collection) continue;
        if (inflight.has(o.op)) break;
        if (o.kind === "create" || o.kind === "update") {
          outbox[i] = { ...o, data: { ...o.data, ...op.data } };
          persisted = { ...persisted, outbox };
          return;
        }
        break;
      }
    }
    if (op.kind === "archive" && last?.id === op.id && last.kind === "create" && !inflight.has(last.op)) {
      outbox.pop();
      persisted = { ...persisted, outbox };
      return;
    }
    persisted = { ...persisted, outbox: [...outbox, op] };
  }

  function hasTmp(value: unknown): boolean {
    return JSON.stringify(value ?? null).includes('"tmp_');
  }

  /**
   * The next ops that can go now. An op that points at a record not yet in
   * Notion waits, and so does every later op on the same record, so each
   * record's changes still arrive in order; independent records go ahead.
   */
  function nextBatch(): Op[] {
    const out: Op[] = [];
    const blocked = new Set<string>();
    for (const op of persisted.outbox) {
      if (out.length >= 6) break;
      const refs = op.kind === "create" || op.kind === "update" ? hasTmp(op.data) : false;
      const selfTmp = op.kind !== "create" && op.id.startsWith("tmp_");
      if (blocked.has(op.id) || refs || selfTmp) {
        blocked.add(op.id);
        continue;
      }
      out.push(op);
    }
    return out;
  }

  /** A record got its Notion id: rewrite every reference to the old one, here and in the outbox. */
  function remap(from: string, to: string) {
    const swap = (s: string) => s.split(from).join(to);
    const data = emptyData();
    const followUps: Op[] = [];
    for (const c of COLLECTION_NAMES) {
      (data[c] as unknown[]) = (persisted.data[c] as unknown as Record<string, unknown>[]).map((r) => {
        const text = JSON.stringify(r);
        if (!text.includes(from)) return r;
        const next = JSON.parse(swap(text)) as Record<string, unknown>;
        if (next.id === to) return next;
        // A reference inside another record changed: send those fields again.
        const changed: Record<string, unknown> = {};
        for (const k of Object.keys(next)) if (JSON.stringify(next[k]) !== JSON.stringify(r[k])) changed[k] = next[k];
        if (Object.keys(changed).length && !String(next.id).startsWith("tmp_")) followUps.push({ op: localId("op"), kind: "update", collection: c, id: String(next.id), data: changed });
        return next;
      });
    }
    persisted = { ...persisted, data, outbox: (JSON.parse(swap(JSON.stringify(persisted.outbox))) as Op[]) };
    for (const f of followUps) enqueue(f);
  }

  async function api(path: string, method: string, body?: unknown) {
    if (!fetcher) throw new Error("offline");
    const res = await fetcher(path, { method, body, key });
    if (res.status === 401) {
      setSync({ status: "signed out", message: "The studio key was not accepted." });
      throw Object.assign(new Error("signed out"), { quiet: true });
    }
    if (res.status >= 400) throw new Error((res.body as { error?: string })?.error ?? `The server answered ${res.status}`);
    return res.body;
  }

  let flushRun: Promise<void> | null = null;

  /** Sends the outbox. A second call while one is running waits for it, then goes again if anything new arrived. */
  function flush(): Promise<void> {
    if (mode !== "notion" || !key) return Promise.resolve();
    if (flushRun) return flushRun.then(() => (persisted.outbox.length && nextBatch().length ? flush() : undefined));
    flushRun = flushOnce().finally(() => {
      flushRun = null;
    });
    return flushRun;
  }

  async function flushOnce(): Promise<void> {
    try {
      for (let guard = 0; guard < 200; guard++) {
        const batch = nextBatch();
        if (!batch.length) break;
        setSync({ status: "syncing" });
        inflight = new Set(batch.map((o) => o.op));
        const res = (await api("/push", "POST", { ops: batch })) as { results: OpResult[] };
        inflight = new Set();
        let progressed = false;
        for (const r of res.results) {
          const op = persisted.outbox.find((o) => o.op === r.op);
          if (!op) continue;
          if (!r.ok) {
            setSync({ status: "error", message: r.error ?? "Notion refused a change.", failed: { op: op.op, collection: op.collection, error: r.error ?? "" } });
            return;
          }
          progressed = true;
          persisted = { ...persisted, outbox: persisted.outbox.filter((o) => o.op !== r.op) };
          if (op.kind === "create" && r.id && r.id !== op.id) remap(op.id, r.id);
          if (r.record && op.kind !== "archive") mergeRows(op.collection, [r.record], false);
        }
        save();
        emit();
        if (!progressed) break;
      }
      setSync({ status: "idle", message: "", lastSync: new Date().toISOString(), failed: null });
    } catch (e) {
      const err = e as Error & { quiet?: boolean };
      if (!err.quiet) setSync({ status: isOffline(err) ? "offline" : "error", message: err.message });
    } finally {
      inflight = new Set();
    }
  }

  /** Server rows win, except fields this device has changed and not yet sent. */
  function mergeRows(c: CollectionName, rows: Record<string, unknown>[], full: boolean) {
    const pendingPatch = new Map<string, Record<string, unknown>>();
    const pendingCreate = new Set<string>();
    for (const o of persisted.outbox) {
      if (o.collection !== c) continue;
      if (o.kind === "create") pendingCreate.add(o.id);
      if (o.kind === "update") pendingPatch.set(o.id, { ...(pendingPatch.get(o.id) ?? {}), ...o.data });
    }
    const current = persisted.data[c] as unknown as Record<string, unknown>[];
    const byId = new Map(current.map((r) => [String(r.id), r]));
    const seen = new Set<string>();
    for (const row of rows) {
      const id = String(row.id);
      seen.add(id);
      const patch = pendingPatch.get(id);
      byId.set(id, patch ? { ...row, ...patch } : row);
    }
    let next = [...byId.values()];
    if (full) next = next.filter((r) => seen.has(String(r.id)) || pendingCreate.has(String(r.id)));
    setData(c, next as unknown as Collections[typeof c][]);
  }

  async function pullOne(c: CollectionName, force = false) {
    const now = Date.now();
    const fullAt = persisted.fullAt[c] ? Date.parse(persisted.fullAt[c]!) : 0;
    const full = force || !persisted.at[c] || now - fullAt > FULL_EVERY_MS;
    let cursor: string | null | undefined;
    const rows: Record<string, unknown>[] = [];
    let at = "";
    do {
      const res = (await api("/pull", "POST", { collection: c, since: full ? undefined : persisted.at[c], cursor })) as { rows: Record<string, unknown>[]; next: string | null; at: string };
      rows.push(...res.rows);
      cursor = res.next;
      at = res.at;
    } while (cursor);
    mergeRows(c, rows, full);
    persisted = { ...persisted, at: { ...persisted.at, [c]: at }, fullAt: full ? { ...persisted.fullAt, [c]: new Date(now).toISOString() } : persisted.fullAt };
  }

  async function pull(which: CollectionName[] = COLLECTION_NAMES, force = false): Promise<void> {
    if (mode !== "notion" || !key || pulling) return;
    pulling = true;
    setSync({ status: "syncing", message: "" });
    try {
      await flush();
      const queue = [...which];
      const worker = async () => {
        for (let c = queue.shift(); c; c = queue.shift()) await pullOne(c, force);
      };
      await Promise.all([worker(), worker()]);
      save();
      setSync({ status: "idle", message: "", lastSync: new Date().toISOString() });
    } catch (e) {
      const err = e as Error & { quiet?: boolean };
      if (!err.quiet) setSync({ status: isOffline(err) ? "offline" : "error", message: err.message });
    } finally {
      pulling = false;
      emit();
    }
  }

  // ------------------------------------------------------------ public

  const api_ = {
    subscribe(l: () => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    get: () => snapshot,
    data: () => persisted.data,
    saveError: () => saveError,
    mode: () => mode,
    key: () => key,

    /** Adds a record and returns it with its local id. `title` names the Notion page where the record has no title of its own. */
    create<K extends CollectionName>(c: K, record: Omit<Collections[K], "id"> & { id?: string }, title?: string): Collections[K] {
      const id = record.id && !record.id.startsWith("tmp_") && mode === "demo" ? record.id : localId(mode === "demo" ? "demo" : "tmp");
      const row = { ...record, id } as Collections[K];
      setData(c, [...(persisted.data[c] as Collections[K][]), row]);
      const { id: _drop, ...data } = row as unknown as Record<string, unknown>;
      void _drop;
      enqueue({ op: localId("op"), kind: "create", collection: c, id, data: title ? { ...data, _title: title } : data });
      save();
      emit();
      void flush();
      return row;
    },

    update<K extends CollectionName>(c: K, id: string, patch: Partial<Collections[K]>, title?: string) {
      const rows = persisted.data[c] as Collections[K][];
      if (!rows.some((r) => r.id === id)) return;
      setData(
        c,
        rows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
      );
      const data = { ...(patch as Record<string, unknown>) };
      delete data.id;
      delete data.edited;
      if (title) data._title = title;
      enqueue({ op: localId("op"), kind: "update", collection: c, id, data });
      save();
      emit();
      void flush();
    },

    archive(c: CollectionName, id: string) {
      setData(
        c,
        (persisted.data[c] as { id: string }[]).filter((r) => r.id !== id) as never,
      );
      enqueue({ op: localId("op"), kind: "archive", collection: c, id });
      save();
      emit();
      void flush();
    },

    /** A day box, typed from paper by the teacher. Merged on the server so a family's own tick is never lost. */
    tick(weekId: string, card: string, day: number, on: boolean, source: Tick["source"] = "paper") {
      const weeks = persisted.data.weeks;
      const w = weeks.find((x) => x.id === weekId);
      if (!w) return;
      setData(
        "weeks",
        weeks.map((x) => (x.id === weekId ? { ...x, ticks: toggleTick(x.ticks, card, day, on, source, isoDate()) } : x)),
      );
      enqueue({ op: localId("op"), kind: "tick", collection: "weeks", id: weekId, card, day, on, source });
      save();
      emit();
      void flush();
    },

    /** Makes (or resets) a student's private family link. Needs the server, so it is online only. */
    async familyLink(studentId: string): Promise<string> {
      if (mode === "demo") {
        const token = `demo${localId("").replace(/[^a-z0-9]/gi, "")}`.slice(0, 24).padEnd(24, "0");
        api_.update("students", studentId, { familyKey: token, familyKeyOn: isoDate() });
        return token;
      }
      const res = (await api("/push", "POST", { ops: [{ op: localId("op"), kind: "familyLink", collection: "students", id: studentId }] })) as { results: OpResult[] };
      const r = res.results[0];
      if (!r?.ok || !r.record) throw new Error(r?.error ?? "The link could not be made.");
      mergeRows("students", [r.record], false);
      save();
      emit();
      return String(r.record.familyKey ?? "");
    },

    pull,
    flush,
    async pullLive() {
      await pull(LIVE);
    },
    async refreshAll() {
      await pull(COLLECTION_NAMES, true);
    },
    slowCollections: SLOW,

    /** Switches between the demo studio and Notion. Each keeps its own copy on this device. */
    connect(next: Mode, nextKey = "") {
      save();
      mode = next;
      key = next === "notion" ? nextKey : "";
      try {
        storage?.setItem(PREFS_KEY, JSON.stringify({ mode, key }));
      } catch {
        /* the key just won't be remembered */
      }
      persisted = load(mode);
      sync = { mode, status: mode === "notion" && !key ? "signed out" : "idle", message: "", pending: persisted.outbox.length, lastSync: "", failed: null };
      emit();
    },

    /** Drops the change Notion refused, so the rest can go. The record on this device keeps the edit until the next full pull. */
    discardFailed() {
      const f = sync.failed;
      if (!f) return;
      persisted = { ...persisted, outbox: persisted.outbox.filter((o) => o.op !== f.op) };
      save();
      setSync({ failed: null, status: "idle", message: "" });
      void flush();
    },

    /** Forgets this device's copy (Notion keeps everything). */
    clearLocal() {
      storage?.removeItem(dataKey(mode));
      persisted = load(mode);
      emit();
    },

    resetDemo() {
      if (mode !== "demo") return;
      persisted = { data: demoData(), outbox: [], at: {}, fullAt: {} };
      save();
      emit();
    },

    /** For tests and the import screen: replace one collection outright. */
    replace<K extends CollectionName>(c: K, rows: Collections[K][]) {
      setData(c, rows);
      save();
      emit();
    },
  };
  return api_;
}

function isOffline(err: Error): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  return err.message === "offline" || err instanceof TypeError || /fetch|network/i.test(err.message);
}

function browserStorage(): StorageLike | null {
  try {
    const s = window.localStorage;
    const probe = "bravissimo.probe";
    s.setItem(probe, "1");
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

export const apiBase = "./api";

const browserFetcher: Fetcher = async (path, init) => {
  const res = await fetch(`${apiBase}${path}`, {
    method: init.method,
    headers: { "Content-Type": "application/json", ...(init.key ? { "x-studio-key": init.key } : {}) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
};

export const store = createStore(typeof window === "undefined" ? null : browserStorage(), typeof window === "undefined" ? null : browserFetcher);

export type Store = ReturnType<typeof createStore>;

export function useStore<T>(select: (s: { data: Data; sync: SyncState }) => T): T {
  return useSyncExternalStore(store.subscribe, () => select(store.get()), () => select(store.get()));
}

export function useData<K extends CollectionName>(c: K): Collections[K][] {
  return useStore((s) => s.data[c]);
}

export function useSync(): SyncState {
  return useStore((s) => s.sync);
}
