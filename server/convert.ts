import type { PageObject, PropertyValue } from "./notion";
import type { CollectionSpec, Field } from "./schema";

/** Notion caps one rich-text run at 2,000 characters and a property at 100 runs. */
const CHUNK = 2000;
const MAX_RUNS = 100;

type RichText = { plain_text?: string; text?: { content: string } }[];

function plain(rt: unknown): string {
  return Array.isArray(rt) ? (rt as RichText).map((r) => r.plain_text ?? r.text?.content ?? "").join("") : "";
}

function chunks(text: string): { type: "text"; text: { content: string } }[] {
  if (!text) return [];
  const out: { type: "text"; text: { content: string } }[] = [];
  for (let i = 0; i < text.length && out.length < MAX_RUNS; i += CHUNK) out.push({ type: "text", text: { content: text.slice(i, i + CHUNK) } });
  if (text.length > CHUNK * MAX_RUNS) throw new Error("Too long to store in one Notion property");
  return out;
}

/** Reads any property as text, whatever its Notion type. */
function asText(v: PropertyValue | undefined): string {
  if (!v) return "";
  switch (v.type) {
    case "title":
      return plain(v.title);
    case "rich_text":
      return plain(v.rich_text);
    case "url":
    case "email":
    case "phone_number":
      return (v[v.type] as string | null) ?? "";
    case "select":
    case "status":
      return ((v[v.type] as { name?: string } | null)?.name ?? "").trim();
    case "multi_select":
      return ((v.multi_select as { name: string }[]) ?? []).map((o) => o.name).join(", ");
    case "number":
      return v.number == null ? "" : String(v.number);
    case "date":
      return (v.date as { start?: string } | null)?.start ?? "";
    case "formula": {
      const f = v.formula as { type: string } & Record<string, unknown>;
      return f ? String(f[f.type] ?? "") : "";
    }
    default:
      return "";
  }
}

export function readField(f: Field, v: PropertyValue | undefined): unknown {
  switch (f.kind) {
    case "title":
    case "text":
    case "url":
    case "select":
      return asText(v);
    case "number": {
      if (v?.type === "number") return (v.number as number | null) ?? null;
      const n = Number(asText(v));
      return asText(v) && Number.isFinite(n) ? n : null;
    }
    case "multi":
      if (v?.type === "multi_select") return ((v.multi_select as { name: string }[]) ?? []).map((o) => o.name);
      return asText(v)
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
    case "multiOne":
      if (v?.type === "multi_select") return ((v.multi_select as { name: string }[]) ?? [])[0]?.name ?? "";
      return asText(v);
    case "date":
      return asText(v).slice(0, 10);
    case "datetime":
      return asText(v);
    case "checkbox":
      return v?.type === "checkbox" ? !!v.checkbox : false;
    case "relation":
      return v?.type === "relation" ? (((v.relation as { id: string }[]) ?? [])[0]?.id ?? "") : "";
    case "relations":
      return v?.type === "relation" ? ((v.relation as { id: string }[]) ?? []).map((r) => r.id) : [];
    case "list":
      return asText(v)
        .split(/[,\s]+/)
        .map((x) => x.trim())
        .filter(Boolean);
    case "json": {
      const t = asText(v);
      if (!t) return undefined;
      try {
        return JSON.parse(t);
      } catch {
        return undefined;
      }
    }
  }
}

/** A Notion page as an app record. Secret fields stay on the server unless asked for. */
export function pageToRecord(spec: CollectionSpec, page: PageObject, opts: { includeSecret?: boolean } = {}): Record<string, unknown> {
  const rec: Record<string, unknown> = { id: page.id, edited: page.last_edited_time };
  for (const f of spec.fields) {
    if (f.secret && !opts.includeSecret) continue;
    const value = readField(f, page.properties[f.prop]);
    const empty = value === undefined || value === "" || value === null || (Array.isArray(value) && !value.length);
    rec[f.key] = empty && f.key in spec.defaults ? structuredClone(spec.defaults[f.key]) : value;
  }
  return rec;
}

function selectValue(value: unknown) {
  const name = String(value ?? "")
    .replace(/,/g, " ")
    .trim()
    .slice(0, 100);
  return name ? { name } : null;
}

export function writeField(f: Field, value: unknown): Record<string, unknown> {
  switch (f.kind) {
    case "title":
      return { title: chunks(String(value ?? "")) };
    case "text":
      return { rich_text: chunks(String(value ?? "")) };
    case "url":
      return { url: value ? String(value) : null };
    case "number": {
      const n = value === "" || value == null ? null : Number(value);
      return { number: n != null && Number.isFinite(n) ? n : null };
    }
    case "select":
      return { select: selectValue(value) };
    case "multi":
      return { multi_select: (Array.isArray(value) ? value : []).map(selectValue).filter(Boolean) };
    case "multiOne":
      return { multi_select: value ? [selectValue(value)].filter(Boolean) : [] };
    case "date":
      return { date: value ? { start: String(value).slice(0, 10) } : null };
    case "datetime":
      return { date: value ? { start: String(value) } : null };
    case "checkbox":
      return { checkbox: !!value };
    case "relation":
      return { relation: value ? [{ id: String(value) }] : [] };
    case "relations":
      return { relation: (Array.isArray(value) ? value : []).filter(Boolean).map((id) => ({ id: String(id) })) };
    case "list":
      return { rich_text: chunks((Array.isArray(value) ? value : []).join(", ")) };
    case "json":
      return { rich_text: chunks(value === undefined ? "" : JSON.stringify(value)) };
  }
}

/** Turns a patch of app fields into Notion properties, with the mirror columns kept in step. */
export function recordToProperties(
  spec: CollectionSpec,
  patch: Record<string, unknown>,
  opts: { allowLocked?: boolean; title?: string } = {},
): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  const written = new Set<string>();
  for (const f of spec.fields) {
    if (!(f.key in patch)) continue;
    if (f.locked && !opts.allowLocked) continue;
    props[f.prop] = writeField(f, patch[f.key]);
    written.add(f.key);
  }
  if (opts.title !== undefined && !spec.fields.some((f) => f.kind === "title")) {
    props.Name = { title: chunks(opts.title.slice(0, 200)) };
  }
  for (const m of spec.mirrors ?? []) {
    if (!written.has(m.from)) continue;
    const v = m.compute(patch[m.from]);
    props[m.prop] = m.kind === "number" ? { number: Number(v) } : { rich_text: chunks(String(v)) };
  }
  return props;
}

/** The Notion schema for a new property. */
export function propertySchema(f: Field, relationTargets: Partial<Record<string, string>>): Record<string, unknown> {
  const options = (f.options ?? []).map((name) => ({ name }));
  switch (f.kind) {
    case "title":
      return { title: {} };
    case "text":
    case "json":
    case "list":
      return { rich_text: {} };
    case "url":
      return { url: {} };
    case "number":
      return { number: { format: "number" } };
    case "select":
      return { select: { options } };
    case "multi":
    case "multiOne":
      return { multi_select: { options } };
    case "date":
    case "datetime":
      return { date: {} };
    case "checkbox":
      return { checkbox: {} };
    case "relation":
    case "relations": {
      const db = f.target ? relationTargets[f.target] : undefined;
      if (!db) throw new Error(`No database for the ${f.prop} relation`);
      return { relation: { database_id: db, type: "single_property", single_property: {} } };
    }
  }
}

/** The Notion type a field is written as, to check an existing database before writing to it. */
export function notionTypeOf(f: Field): string {
  switch (f.kind) {
    case "title":
      return "title";
    case "text":
    case "json":
    case "list":
      return "rich_text";
    case "multiOne":
    case "multi":
      return "multi_select";
    case "datetime":
      return "date";
    case "relations":
      return "relation";
    default:
      return f.kind;
  }
}
