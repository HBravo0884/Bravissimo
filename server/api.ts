import { notionClient, queryDatabase, sameId, type FetchLike, type NotionClient, type PageObject } from "./notion";
import { pageToRecord, recordToProperties } from "./convert";
import { discover, setup, type DatabaseMap } from "./discover";
import { SPECS } from "./schema";
import { familyView, familyVisible } from "../shared/family";
import { addDays, isoDate } from "../shared/dates";
import { toggleTick } from "../shared/records";
import {
  COLLECTION_NAMES,
  type CollectionName,
  type ListeningEntry,
  type Op,
  type OpResult,
  type Practice,
  type Progress,
  type Resource,
  type Rung,
  type Student,
  type StudentChallenge,
  type Tick,
  type Week,
} from "../shared/types";

/**
 * The app's only server: a Netlify Function between the browser and Notion.
 * The teacher's device signs in with the studio key; a family's link carries
 * one student's family key and reaches that student's family-visible week only.
 */

export interface Env {
  NOTION_TOKEN?: string;
  NOTION_ROOT_PAGE?: string;
  STUDIO_KEY?: string;
  [k: string]: string | undefined;
}

export interface Deps {
  fetch: FetchLike;
  now?: () => Date;
  random?: (bytes: number) => Uint8Array;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

const fail = (status: number, error: string) => json({ error }, status);

/** Compares without leaking where the strings differ. */
export function sameSecret(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

function overridesFrom(env: Env): DatabaseMap {
  const out: DatabaseMap = {};
  for (const c of COLLECTION_NAMES) {
    const v = env[`NOTION_DB_${c.toUpperCase()}`];
    if (v) out[c] = v;
  }
  return out;
}

// Discovery and studio content are cached while the function instance stays warm.
let cache: { key: string; at: number; dbs: DatabaseMap } | null = null;
let contentCache: { at: number; rungs: Rung[]; resources: Resource[] } | null = null;
const TEN_MINUTES = 10 * 60 * 1000;

export function resetCaches() {
  cache = null;
  contentCache = null;
}

async function databases(client: NotionClient, env: Env, now: number, force = false): Promise<DatabaseMap> {
  const key = `${env.NOTION_ROOT_PAGE}`;
  if (!force && cache && cache.key === key && now - cache.at < TEN_MINUTES) return cache.dbs;
  const found = await discover(client, env.NOTION_ROOT_PAGE!, overridesFrom(env));
  cache = { key, at: now, dbs: found.databases };
  return found.databases;
}

function need(dbs: DatabaseMap, c: CollectionName): string {
  const id = dbs[c];
  if (!id) throw Object.assign(new Error(`The ${SPECS[c].db} database is not set up yet. Open Settings and run Set up Notion.`), { status: 409 });
  return id;
}

function tokenFrom(random: (n: number) => Uint8Array): string {
  const bytes = random(18);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const defaultRandom = (n: number) => crypto.getRandomValues(new Uint8Array(n));

const VALID_TOKEN = /^[A-Za-z0-9_-]{20,64}$/;

export async function handle(req: Request, env: Env, deps: Deps): Promise<Response> {
  const url = new URL(req.url);
  const route = url.pathname.replace(/^\/(\.netlify\/functions\/api|api)/, "").replace(/\/+$/, "") || "/";
  const now = deps.now?.() ?? new Date();
  const configured = !!(env.NOTION_TOKEN && env.NOTION_ROOT_PAGE && env.STUDIO_KEY);

  if (route === "/status" && req.method === "GET" && !req.headers.get("x-studio-key")) return json({ configured });
  if (!configured) return fail(503, "The server is not set up yet: NOTION_TOKEN, NOTION_ROOT_PAGE and STUDIO_KEY are needed.");

  const client = notionClient(env.NOTION_TOKEN!, deps.fetch);
  try {
    if (route === "/family") return await family(req, url, client, env, deps, now);

    const key = req.headers.get("x-studio-key") ?? "";
    if (!sameSecret(key, env.STUDIO_KEY!)) return fail(401, "That studio key is not right.");

    if (route === "/status") {
      const dbs = await databases(client, env, now.getTime(), true);
      const missing = COLLECTION_NAMES.filter((c) => !dbs[c]);
      return json({ configured, databases: Object.fromEntries(COLLECTION_NAMES.map((c) => [c, !!dbs[c]])), missing });
    }
    if (route === "/setup" && req.method === "POST") {
      const report = await setup(client, env.NOTION_ROOT_PAGE!, overridesFrom(env));
      cache = { key: `${env.NOTION_ROOT_PAGE}`, at: now.getTime(), dbs: report.databases };
      return json({ ...report, databases: Object.fromEntries(COLLECTION_NAMES.map((c) => [c, !!report.databases[c]])) });
    }
    if (route === "/pull" && req.method === "POST") return await pull(await req.json(), client, env, now);
    if (route === "/push" && req.method === "POST") return await push(await req.json(), client, env, deps, now);
    return fail(404, "Not found");
  } catch (e) {
    const err = e as Error & { status?: number; code?: string };
    if (err.status === 409) return fail(409, err.message);
    if (err.code === "object_not_found") return fail(404, "not found");
    return fail(502, err.message || "Something went wrong talking to Notion.");
  }
}

// ---------------------------------------------------------------- teacher: pull

async function pull(body: { collection?: string; since?: string; cursor?: string; full?: boolean }, client: NotionClient, env: Env, now: Date): Promise<Response> {
  const c = body.collection as CollectionName;
  if (!COLLECTION_NAMES.includes(c)) return fail(400, "Unknown collection");
  const spec = SPECS[c];
  const dbs = await databases(client, env, now.getTime());
  const db = need(dbs, c);
  let filter: unknown;
  if (body.since) {
    // Notion keeps edit times to the minute, so look back a little and let the browser de-duplicate.
    const since = new Date(new Date(body.since).getTime() - 2 * 60 * 1000).toISOString();
    filter = { timestamp: "last_edited_time", last_edited_time: { on_or_after: since } };
  } else if (spec.recent && !body.full) {
    filter = { property: spec.recent.prop, date: { on_or_after: addDays(isoDate(now), -spec.recent.days) } };
  }
  const { pages, next } = await queryDatabase(client, db, { ...(filter ? { filter } : {}), start_cursor: body.cursor }, 4);
  return json({ rows: pages.map((p) => pageToRecord(spec, p)), next, at: now.toISOString() });
}

// ---------------------------------------------------------------- teacher: push

const TITLE_MAX = 200;

async function push(body: { ops?: Op[] }, client: NotionClient, env: Env, deps: Deps, now: Date): Promise<Response> {
  const ops = Array.isArray(body.ops) ? body.ops.slice(0, 10) : [];
  const dbs = await databases(client, env, now.getTime());
  const results: OpResult[] = [];
  for (const op of ops) {
    try {
      results.push(await applyOp(op, client, dbs, deps, now));
    } catch (e) {
      results.push({ op: op.op, ok: false, error: (e as Error).message });
      // Later ops may depend on this one (a tmp id), so stop here and let the browser retry.
      break;
    }
  }
  return json({ results });
}

async function getPage(client: NotionClient, id: string): Promise<PageObject> {
  return client.request<PageObject>("GET", `pages/${id}`);
}

async function applyOp(op: Op, client: NotionClient, dbs: DatabaseMap, deps: Deps, now: Date): Promise<OpResult> {
  if (!COLLECTION_NAMES.includes(op.collection)) throw new Error("Unknown collection");
  const spec = SPECS[op.collection];
  if (spec.readOnly) throw new Error(`${spec.db} is read only in the app`);
  const db = need(dbs, op.collection);

  if (op.kind === "create") {
    const data = { ...op.data };
    const title = typeof data._title === "string" ? data._title.slice(0, TITLE_MAX) : undefined;
    delete data._title;
    delete data.id;
    if (op.collection === "practice" && typeof data.key === "string" && data.key) {
      // One practice row per student, game and day: add to it rather than starting another.
      const found = await queryDatabase(client, db, { filter: { property: "Key", rich_text: { equals: data.key } } }, 1);
      const existing = found.pages[0];
      if (existing) {
        const before = pageToRecord(spec, existing) as unknown as Practice;
        const merged = mergePractice(before, data as unknown as Partial<Practice>);
        const page = await client.request<PageObject>("PATCH", `pages/${existing.id}`, { properties: recordToProperties(spec, merged as unknown as Record<string, unknown>) });
        return { op: op.op, ok: true, id: page.id, record: pageToRecord(spec, page) };
      }
    }
    const page = await client.request<PageObject>("POST", "pages", {
      parent: { database_id: db },
      properties: recordToProperties(spec, data, { title: title ?? "" }),
    });
    return { op: op.op, ok: true, id: page.id, record: pageToRecord(spec, page) };
  }

  if (op.id.startsWith("tmp_")) throw new Error("This change waits for its record to be created first");

  if (op.kind === "update") {
    const data = { ...op.data };
    const title = typeof data._title === "string" ? data._title.slice(0, TITLE_MAX) : undefined;
    delete data._title;
    delete data.id;
    const props = recordToProperties(spec, data, { title });
    const page = Object.keys(props).length ? await client.request<PageObject>("PATCH", `pages/${op.id}`, { properties: props }) : await getPage(client, op.id);
    return { op: op.op, ok: true, id: page.id, record: pageToRecord(spec, page) };
  }

  if (op.kind === "archive") {
    await client.request("PATCH", `pages/${op.id}`, { archived: true });
    return { op: op.op, ok: true, id: op.id };
  }

  if (op.kind === "tick") {
    const page = await getPage(client, op.id);
    const week = pageToRecord(SPECS.weeks, page) as unknown as Week;
    const ticks = toggleTick(week.ticks ?? [], op.card, op.day, op.on, op.source, isoDate(now));
    const updated = await client.request<PageObject>("PATCH", `pages/${op.id}`, { properties: recordToProperties(SPECS.weeks, { ticks }, { allowLocked: true }) });
    return { op: op.op, ok: true, id: op.id, record: pageToRecord(SPECS.weeks, updated) };
  }

  if (op.kind === "familyLink") {
    const token = tokenFrom(deps.random ?? defaultRandom);
    const page = await client.request<PageObject>("PATCH", `pages/${op.id}`, {
      properties: recordToProperties(SPECS.students, { familyKey: token, familyKeyOn: isoDate(now) }, { allowLocked: true }),
    });
    return { op: op.op, ok: true, id: op.id, record: pageToRecord(SPECS.students, page) };
  }

  throw new Error("Unknown change");
}

export function mergePractice(before: Practice, add: Partial<Practice>): Partial<Practice> {
  const a = before.summary ?? { rounds: 0, attempts: 0, correct: 0, fiveInARow: [], slow: [] };
  const b = add.summary ?? { rounds: 0, attempts: 0, correct: 0, fiveInARow: [], slow: [] };
  return {
    ...add,
    minutes: Math.round(((before.minutes ?? 0) + (add.minutes ?? 0)) * 10) / 10,
    summary: {
      rounds: a.rounds + b.rounds,
      attempts: a.attempts + b.attempts,
      correct: a.correct + b.correct,
      fiveInARow: [...new Set([...(a.fiveInARow ?? []), ...(b.fiveInARow ?? [])])],
      slow: [...new Set([...(b.slow ?? []), ...(a.slow ?? [])])].slice(0, 8),
    },
  };
}

// ---------------------------------------------------------------- family

async function studioContent(client: NotionClient, dbs: DatabaseMap, now: number): Promise<{ rungs: Rung[]; resources: Resource[] }> {
  if (contentCache && now - contentCache.at < TEN_MINUTES) return contentCache;
  const [rungs, resources] = await Promise.all([
    dbs.rungs ? queryDatabase(client, dbs.rungs, {}, 2).then((r) => r.pages.map((p) => pageToRecord(SPECS.rungs, p) as unknown as Rung)) : Promise.resolve([]),
    dbs.resources ? queryDatabase(client, dbs.resources, {}, 1).then((r) => r.pages.map((p) => pageToRecord(SPECS.resources, p) as unknown as Resource)) : Promise.resolve([]),
  ]);
  contentCache = { at: now, rungs, resources };
  return contentCache;
}

async function familyStudent(client: NotionClient, dbs: DatabaseMap, k: string): Promise<Student | null> {
  const res = await queryDatabase(client, need(dbs, "students"), { filter: { property: "Family key", rich_text: { equals: k } } }, 1);
  const page = res.pages[0];
  if (!page) return null;
  const s = pageToRecord(SPECS.students, page) as unknown as Student;
  // Equality in Notion's filter is not case-sensitive everywhere; insist on an exact match.
  return sameSecret(s.familyKey, k) ? s : null;
}

async function familyWeek(client: NotionClient, dbs: DatabaseMap, student: string): Promise<Week | undefined> {
  const res = await queryDatabase(
    client,
    need(dbs, "weeks"),
    {
      filter: {
        and: [
          { property: "Student", relation: { contains: student } },
          { or: ["verified", "printed", "handed out"].map((s) => ({ property: "Status", select: { equals: s } })) },
        ],
      },
      sorts: [{ property: "Date", direction: "descending" }],
    },
    1,
  );
  return res.pages.map((p) => pageToRecord(SPECS.weeks, p) as unknown as Week).sort((a, b) => b.date.localeCompare(a.date) || b.edition - a.edition)[0];
}

async function family(req: Request, url: URL, client: NotionClient, env: Env, deps: Deps, now: Date): Promise<Response> {
  const dbs = await databases(client, env, now.getTime());
  const body = req.method === "POST" ? ((await req.json()) as Record<string, unknown>) : {};
  const k = String((req.method === "POST" ? body.k : url.searchParams.get("k")) ?? "");
  if (!VALID_TOKEN.test(k)) return fail(404, "not found");
  const student = await familyStudent(client, dbs, k);
  if (!student) return fail(404, "not found");
  const today = isoDate(now);

  if (req.method === "GET") {
    const week = await familyWeek(client, dbs, student.id);
    const [challengesRes, progressRes, content] = await Promise.all([
      student.pointsMode === "plays for points" && dbs.challenges
        ? queryDatabase(client, dbs.challenges, { filter: { and: [{ property: "Student", relation: { contains: student.id } }, { property: "State", select: { equals: "open" } }] } }, 1)
        : Promise.resolve({ pages: [] as PageObject[], next: null }),
      dbs.progress ? queryDatabase(client, dbs.progress, { filter: { property: "Student", relation: { contains: student.id } } }, 2) : Promise.resolve({ pages: [] as PageObject[], next: null }),
      studioContent(client, dbs, now.getTime()),
    ]);
    if (week && week.seen !== today) {
      await client.request("PATCH", `pages/${week.id}`, { properties: recordToProperties(SPECS.weeks, { seen: today }, { allowLocked: true }) });
    }
    const view = familyView({
      student,
      week,
      challenges: challengesRes.pages.map((p) => pageToRecord(SPECS.challenges, p) as unknown as StudentChallenge),
      progress: progressRes.pages.map((p) => pageToRecord(SPECS.progress, p) as unknown as Progress),
      rungs: content.rungs,
      resources: content.resources,
    });
    return json(view);
  }

  if (req.method !== "POST") return fail(405, "method");
  const action = String(body.action ?? "");

  if (action === "practice") {
    const game = String(body.game ?? "").slice(0, 40);
    const minutes = Math.max(0, Math.min(120, Number(body.minutes) || 0));
    if (!game || !dbs.practice) return fail(400, "bad request");
    const summary = (body.summary ?? {}) as Practice["summary"];
    const key = `${student.id}|${today}|${game}`;
    const r = await applyOp(
      {
        op: "family",
        kind: "create",
        collection: "practice",
        id: "",
        data: {
          _title: `${game} ${today}`,
          student: student.id,
          date: today,
          game,
          minutes,
          countsToward: String(body.countsToward ?? "").slice(0, 20),
          summary: {
            rounds: Number(summary.rounds) || 0,
            attempts: Number(summary.attempts) || 0,
            correct: Number(summary.correct) || 0,
            fiveInARow: (Array.isArray(summary.fiveInARow) ? summary.fiveInARow : []).map(String).slice(0, 12),
            slow: (Array.isArray(summary.slow) ? summary.slow : []).map(String).slice(0, 8),
          },
          key,
        },
      },
      client,
      dbs,
      deps,
      now,
    );
    return json({ ok: r.ok });
  }

  const weekId = String(body.week ?? "");
  if (!weekId) return fail(400, "bad request");
  const page = await getPage(client, weekId);
  const week = pageToRecord(SPECS.weeks, page) as unknown as Week;
  if (!sameId(week.student, student.id) || !familyVisible(week)) return fail(404, "not found");
  const cardIds = new Set((week.sheet?.cards ?? []).map((c) => c.id));
  let patch: Partial<Week>;

  if (action === "tick") {
    const card = String(body.card ?? "");
    const day = Number(body.day);
    if (!cardIds.has(card) || !(day >= 1 && day <= 7)) return fail(400, "bad request");
    patch = { ticks: toggleTick(week.ticks ?? [], card, day, !!body.on, "app", today) as Tick[] };
  } else if (action === "gotit") {
    const card = String(body.card ?? "");
    if (!cardIds.has(card)) return fail(400, "bad request");
    const gotIt = { ...(week.gotIt ?? {}) };
    if (body.on === false) delete gotIt[card];
    else gotIt[card] = today;
    patch = { gotIt };
  } else if (action === "write") {
    const text = String(body.text ?? "").trim().slice(0, 1500);
    if (!text) return fail(400, "bad request");
    patch = { notes: [...(week.notes ?? []), { text, on: now.toISOString() }].slice(-20) };
  } else if (action === "listen") {
    const e = (body.entry ?? {}) as Partial<ListeningEntry>;
    const entry: ListeningEntry = {
      artist: String(e.artist ?? "").slice(0, 120),
      track: String(e.track ?? "").slice(0, 160),
      noticed: String(e.noticed ?? "").slice(0, 500),
      steal: String(e.steal ?? "").slice(0, 500),
      on: now.toISOString(),
    };
    if (!entry.artist && !entry.track && !entry.noticed && !entry.steal) return fail(400, "bad request");
    patch = { listening: [...(week.listening ?? []), entry].slice(-20) };
  } else {
    return fail(400, "bad request");
  }

  const updated = await client.request<PageObject>("PATCH", `pages/${week.id}`, {
    properties: recordToProperties(SPECS.weeks, patch as Record<string, unknown>, { allowLocked: true }),
  });
  const after = pageToRecord(SPECS.weeks, updated) as unknown as Week;
  return json({ ok: true, ticks: after.ticks.map((t) => ({ card: t.card, day: t.day })), notes: after.notes, listening: after.listening, gotIt: after.gotIt });
}
