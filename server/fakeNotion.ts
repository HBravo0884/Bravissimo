import type { FetchLike } from "./notion";

/**
 * An in-memory stand-in for the parts of the Notion API the function uses,
 * close enough to test setup, sync and the family link without a network.
 */

type Props = Record<string, { type: string } & Record<string, unknown>>;

interface FakeDb {
  id: string;
  title: string;
  parent: string;
  properties: Record<string, { type: string } & Record<string, unknown>>;
}

interface FakePage {
  id: string;
  parent: { database_id?: string; page_id?: string };
  title?: string;
  properties: Props;
  last_edited_time: string;
  archived: boolean;
}

export class FakeNotion {
  dbs = new Map<string, FakeDb>();
  pages = new Map<string, FakePage>();
  children = new Map<string, { id: string; type: string; title: string }[]>();
  calls: string[] = [];
  private n = 0;
  clock = new Date("2026-10-05T12:00:00Z");

  nextId(): string {
    this.n++;
    const hex = this.n.toString(16).padStart(12, "0");
    return `00000000-0000-4000-8000-${hex}`;
  }

  tick(minutes = 1) {
    this.clock = new Date(this.clock.getTime() + minutes * 60_000);
  }

  addPage(title: string, parent?: string): string {
    const id = this.nextId();
    this.pages.set(id, { id, parent: parent ? { page_id: parent } : {}, title, properties: {}, last_edited_time: this.clock.toISOString(), archived: false });
    if (parent) this.childList(parent).push({ id, type: "child_page", title });
    return id;
  }

  addDatabase(title: string, parent: string, properties: FakeDb["properties"]): string {
    const id = this.nextId();
    this.dbs.set(id, { id, title, parent, properties });
    this.childList(parent).push({ id, type: "child_database", title });
    return id;
  }

  /** Adds a row the way Notion would hold it, from simple values. */
  addRow(db: string, values: Record<string, unknown>): string {
    const d = this.dbs.get(db)!;
    const props: Props = {};
    for (const [name, schema] of Object.entries(d.properties)) props[name] = this.valueFor(schema.type, values[name]);
    const id = this.nextId();
    this.pages.set(id, { id, parent: { database_id: db }, properties: props, last_edited_time: this.clock.toISOString(), archived: false });
    return id;
  }

  private valueFor(type: string, v: unknown): { type: string } & Record<string, unknown> {
    const text = (s: unknown) => (s ? [{ plain_text: String(s), text: { content: String(s) } }] : []);
    switch (type) {
      case "title":
        return { type, title: text(v) };
      case "rich_text":
        return { type, rich_text: text(v) };
      case "number":
        return { type, number: v ?? null };
      case "select":
        return { type, select: v ? { name: v } : null };
      case "multi_select":
        return { type, multi_select: ((v as string[]) ?? []).map((name) => ({ name })) };
      case "date":
        return { type, date: v ? { start: v } : null };
      case "checkbox":
        return { type, checkbox: !!v };
      case "url":
        return { type, url: v ?? null };
      case "relation":
        return { type, relation: ((v as string[]) ?? []).map((id) => ({ id })) };
      default:
        return { type, [type]: v ?? null };
    }
  }

  private childList(id: string) {
    if (!this.children.has(id)) this.children.set(id, []);
    return this.children.get(id)!;
  }

  private writeProps(db: FakeDb | undefined, page: FakePage, props: Record<string, Record<string, unknown>>) {
    for (const [name, value] of Object.entries(props)) {
      const type = db?.properties[name]?.type ?? (name === "title" ? "title" : Object.keys(value)[0]);
      if (db && !db.properties[name]) throw this.error(400, "validation_error", `${name} is not a property that exists.`);
      const key = Object.keys(value)[0];
      if (db && key !== type) throw this.error(400, "validation_error", `${name} is expected to be ${type}.`);
      let v = value[key];
      if (type === "rich_text" || type === "title") v = ((v as { text: { content: string } }[]) ?? []).map((r) => ({ plain_text: r.text.content, text: r.text }));
      page.properties[name] = { type, [type]: v } as { type: string } & Record<string, unknown>;
    }
  }

  private error(status: number, code: string, message: string) {
    return Object.assign(new Error(message), { status, code });
  }

  private textOf(v: ({ type: string } & Record<string, unknown>) | undefined): string {
    if (!v) return "";
    const arr = v[v.type];
    if (Array.isArray(arr)) return (arr as { plain_text?: string }[]).map((r) => r.plain_text ?? "").join("");
    if (v.type === "select") return (arr as { name?: string } | null)?.name ?? "";
    if (v.type === "date") return (arr as { start?: string } | null)?.start ?? "";
    return String(arr ?? "");
  }

  private matches(page: FakePage, f: Record<string, unknown> | undefined): boolean {
    if (!f) return true;
    if (Array.isArray(f.and)) return (f.and as Record<string, unknown>[]).every((x) => this.matches(page, x));
    if (Array.isArray(f.or)) return (f.or as Record<string, unknown>[]).some((x) => this.matches(page, x));
    if (f.timestamp === "last_edited_time") {
      const c = f.last_edited_time as { on_or_after: string };
      return page.last_edited_time >= c.on_or_after;
    }
    const prop = page.properties[f.property as string];
    if (f.rich_text) return this.textOf(prop) === (f.rich_text as { equals: string }).equals;
    if (f.select) return this.textOf(prop) === (f.select as { equals: string }).equals;
    if (f.relation) {
      const want = (f.relation as { contains: string }).contains;
      return ((prop?.relation as { id: string }[]) ?? []).some((r) => r.id === want);
    }
    if (f.date) {
      const d = this.textOf(prop);
      return !!d && d >= (f.date as { on_or_after: string }).on_or_after;
    }
    return true;
  }

  private pageJson(p: FakePage) {
    return { object: "page", id: p.id, last_edited_time: p.last_edited_time, archived: p.archived, properties: p.properties };
  }

  async route(method: string, path: string, body: Record<string, unknown> | undefined): Promise<unknown> {
    this.calls.push(`${method} ${path}`);
    const [p, query] = path.split("?");
    const parts = p.split("/");
    if (parts[0] === "blocks" && parts[2] === "children") {
      return { results: this.childList(parts[1]).map((c) => ({ id: c.id, type: c.type, [c.type]: { title: c.title } })), has_more: false, next_cursor: null };
    }
    if (parts[0] === "databases" && parts.length === 1 && method === "POST") {
      const parent = (body!.parent as { page_id: string }).page_id;
      const title = (body!.title as { text: { content: string } }[])[0].text.content;
      const props: FakeDb["properties"] = {};
      for (const [name, schema] of Object.entries(body!.properties as Record<string, Record<string, unknown>>)) props[name] = { type: Object.keys(schema)[0], ...schema };
      const id = this.addDatabase(title, parent, props);
      return { object: "database", id };
    }
    if (parts[0] === "databases" && parts[2] === "query") {
      const db = this.dbs.get(parts[1]);
      if (!db) throw this.error(404, "object_not_found", "no database");
      let rows = [...this.pages.values()].filter((pg) => pg.parent.database_id === db.id && !pg.archived && this.matches(pg, body?.filter as Record<string, unknown>));
      const sorts = body?.sorts as { property: string; direction: string }[] | undefined;
      if (sorts?.[0]) {
        const s = sorts[0];
        rows = rows.sort((a, b) => this.textOf(a.properties[s.property]).localeCompare(this.textOf(b.properties[s.property])) * (s.direction === "descending" ? -1 : 1));
      }
      const size = Number(body?.page_size ?? 100);
      const start = Number(body?.start_cursor ?? 0);
      const slice = rows.slice(start, start + size);
      const more = start + size < rows.length;
      return { results: slice.map((r) => this.pageJson(r)), has_more: more, next_cursor: more ? String(start + size) : null };
    }
    if (parts[0] === "databases" && parts.length === 2) {
      const db = this.dbs.get(parts[1]);
      if (!db) throw this.error(404, "object_not_found", "no database");
      if (method === "PATCH") {
        for (const [name, schema] of Object.entries(body!.properties as Record<string, Record<string, unknown>>)) db.properties[name] = { type: Object.keys(schema)[0], ...schema };
      }
      return { object: "database", id: db.id, properties: db.properties };
    }
    if (parts[0] === "pages" && parts.length === 1 && method === "POST") {
      const parent = body!.parent as { database_id?: string; page_id?: string };
      if (parent.page_id) {
        const title = ((body!.properties as { title: { title: { text: { content: string } }[] } }).title.title[0]?.text.content) ?? "";
        const id = this.addPage(title, parent.page_id);
        return this.pageJson(this.pages.get(id)!);
      }
      const db = this.dbs.get(parent.database_id!);
      if (!db) throw this.error(404, "object_not_found", "no database");
      const id = this.nextId();
      const page: FakePage = { id, parent: { database_id: db.id }, properties: {}, last_edited_time: this.clock.toISOString(), archived: false };
      for (const [name, schema] of Object.entries(db.properties)) page.properties[name] = this.valueFor(schema.type, undefined);
      this.writeProps(db, page, body!.properties as Record<string, Record<string, unknown>>);
      this.pages.set(id, page);
      return this.pageJson(page);
    }
    if (parts[0] === "pages" && parts.length === 2) {
      const page = this.pages.get(parts[1]);
      if (!page) throw this.error(404, "object_not_found", "no page");
      if (method === "PATCH") {
        if (body?.archived) page.archived = true;
        if (body?.properties) this.writeProps(this.dbs.get(page.parent.database_id ?? ""), page, body.properties as Record<string, Record<string, unknown>>);
        page.last_edited_time = this.clock.toISOString();
      }
      return this.pageJson(page);
    }
    void query;
    throw this.error(404, "object_not_found", `no route ${method} ${path}`);
  }

  fetch: FetchLike = async (url, init) => {
    const path = url.replace("https://api.notion.com/v1/", "");
    try {
      const out = await this.route(init.method, path, init.body ? JSON.parse(init.body) : undefined);
      return { status: 200, headers: { get: () => null }, json: async () => out, text: async () => JSON.stringify(out) };
    } catch (e) {
      const err = e as Error & { status?: number; code?: string };
      const out = { object: "error", status: err.status ?? 500, code: err.code ?? "internal", message: err.message };
      return { status: err.status ?? 500, headers: { get: () => null }, json: async () => out, text: async () => JSON.stringify(out) };
    }
  };
}

/** A tracker shaped like the real one: the four databases on one page, with the properties the app reads. */
export function fakeTracker(): { notion: FakeNotion; root: string; students: string; lessons: string; threads: string; songs: string } {
  const notion = new FakeNotion();
  const root = notion.addPage("Student tracker");
  const p = (type: string, extra: Record<string, unknown> = {}) => ({ type, [type]: {}, ...extra });
  const students = notion.addDatabase("Students", root, {
    Name: p("title"),
    Status: p("select"),
    Slot: p("multi_select"),
    Time: p("multi_select"),
    Location: p("select"),
    Sessions: p("multi_select"),
    Age: p("number"),
    "Level Up": p("rich_text"),
    Playlist: p("url"),
    "Goal Piece": p("rich_text"),
    Repertoire: p("rich_text"),
    "FERN Status": p("multi_select"),
    "Practice Prescription": p("multi_select"),
    "Current Goal (Sprint)": p("rich_text"),
    "Creative Challenge": p("rich_text"),
    "Experience level": p("multi_select"),
    Folder: p("url"),
    Text: p("rich_text"),
    "Warm-Fuzzy Log": p("rich_text"),
    "Ear Training": p("rich_text"),
    "Current Focus": p("select"),
    "Repertoire Status": p("select"),
    "Level Up Rank": p("select"),
    "🎒 Acquired Skills": p("multi_select"),
    "🎯 Current Challenges": p("multi_select"),
  });
  const threads = notion.addDatabase("Threads", root, {
    Name: p("title"),
    Kind: p("select"),
    Status: p("select"),
    Student: p("relation"),
    "What we are watching": p("rich_text"),
    "Next move": p("rich_text"),
    Opened: p("date"),
    "Last touched": p("date"),
    Lessons: p("relation"),
  });
  const lessons = notion.addDatabase("Lessons", root, {
    Name: p("title"),
    Date: p("date"),
    Student: p("relation"),
    Location: p("select"),
    Status: p("select"),
    "What changed": p("rich_text"),
    Evidence: p("rich_text"),
    Assigned: p("rich_text"),
    Unresolved: p("rich_text"),
    Threads: p("relation"),
    Transcript: p("url"),
    Report: p("url"),
  });
  const songs = notion.addDatabase("🎵 Songs", root, {
    Song: p("title"),
    "Level (1–10)": p("select"),
    Difficulty: p("select"),
    Link: p("url"),
    Notes: p("rich_text"),
  });
  return { notion, root, students, lessons, threads, songs };
}
