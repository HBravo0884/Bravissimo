import { listChildren, type NotionClient } from "./notion";
import { notionTypeOf, propertySchema } from "./convert";
import { APP_PAGE_TITLE, SPECS, type CollectionSpec } from "./schema";
import { COLLECTION_NAMES, type CollectionName } from "../shared/types";

export type DatabaseMap = Partial<Record<CollectionName, string>>;

/** "🎵 Songs" and "Songs" are the same database. */
export function normTitle(t: string): string {
  return t
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .toLowerCase();
}

function matchSpec(title: string): CollectionSpec | undefined {
  const n = normTitle(title);
  return COLLECTION_NAMES.map((c) => SPECS[c]).find((s) => normTitle(s.db) === n);
}

export interface Discovery {
  databases: DatabaseMap;
  appPage: string | null;
}

/**
 * Finds the databases: the tracker's own under the root page, the app's under
 * its "Bravissimo" child page. NOTION_DB_<NAME> variables override discovery.
 */
export async function discover(client: NotionClient, rootPage: string, overrides: DatabaseMap = {}): Promise<Discovery> {
  const databases: DatabaseMap = {};
  let appPage: string | null = null;
  const blocks = await listChildren(client, rootPage);
  for (const b of blocks) {
    if (b.type === "child_database" && b.child_database) {
      const spec = matchSpec(b.child_database.title);
      if (spec && spec.existing && !databases[spec.name]) databases[spec.name] = b.id;
    }
    if (b.type === "child_page" && b.child_page && normTitle(b.child_page.title) === normTitle(APP_PAGE_TITLE)) appPage = b.id;
  }
  if (appPage) {
    for (const b of await listChildren(client, appPage)) {
      if (b.type !== "child_database" || !b.child_database) continue;
      const spec = matchSpec(b.child_database.title);
      if (spec && !databases[spec.name]) databases[spec.name] = b.id;
    }
  }
  return { databases: { ...databases, ...overrides }, appPage };
}

export interface SetupReport {
  created: string[];
  addedProperties: string[];
  problems: string[];
  databases: DatabaseMap;
}

interface DatabaseObject {
  id: string;
  properties: Record<string, { type: string }>;
}

/**
 * Makes the tracker ready for the app. It adds, never removes: the app's page and
 * databases are created when missing, and on the tracker's own databases only
 * the properties the app needs are added. A property that exists with another
 * type is reported, not changed.
 */
export async function setup(client: NotionClient, rootPage: string, overrides: DatabaseMap = {}): Promise<SetupReport> {
  const report: SetupReport = { created: [], addedProperties: [], problems: [], databases: {} };
  const found = await discover(client, rootPage, overrides);
  const dbs = { ...found.databases };

  for (const name of ["students", "lessons", "threads", "songs"] as const) {
    if (!dbs[name]) report.problems.push(`The ${SPECS[name].db} database was not found on the tracker page.`);
  }

  let appPage = found.appPage;
  const missingApp = COLLECTION_NAMES.filter((c) => !SPECS[c].existing && !dbs[c]);
  if (missingApp.length && !appPage) {
    const page = await client.request<{ id: string }>("POST", "pages", {
      parent: { type: "page_id", page_id: rootPage },
      properties: { title: { title: [{ type: "text", text: { content: APP_PAGE_TITLE } }] } },
      children: [
        {
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: [
              {
                type: "text",
                text: { content: "The Bravissimo app keeps its weekly sheets, promises, ladders, challenges, practice, repertoire, reports and studio content here, beside the tracker's Students, Lessons, Threads and Songs. Edit in the app or here; both read the same rows." },
              },
            ],
          },
        },
      ],
    });
    appPage = page.id;
    report.created.push(APP_PAGE_TITLE);
  }

  // Create in an order that lets relations point at databases that already exist.
  for (const name of missingApp) {
    const spec = SPECS[name];
    const properties: Record<string, unknown> = {};
    if (!spec.fields.some((f) => f.kind === "title")) properties.Name = { title: {} };
    for (const f of spec.fields) {
      if (f.target && !dbs[f.target]) {
        report.problems.push(`${spec.db}: skipped ${f.prop}, because ${SPECS[f.target].db} was not found.`);
        continue;
      }
      properties[f.prop] = propertySchema(f, dbs);
    }
    for (const m of spec.mirrors ?? []) properties[m.prop] = m.kind === "number" ? { number: { format: "number" } } : { rich_text: {} };
    const db = await client.request<{ id: string }>("POST", "databases", {
      parent: { type: "page_id", page_id: appPage },
      title: [{ type: "text", text: { content: spec.db } }],
      properties,
    });
    dbs[name] = db.id;
    report.created.push(spec.db);
  }

  // Add what is missing to every database, the tracker's own included.
  for (const name of COLLECTION_NAMES) {
    const id = dbs[name];
    const spec = SPECS[name];
    if (!id) continue;
    const db = await client.request<DatabaseObject>("GET", `databases/${id}`);
    const add: Record<string, unknown> = {};
    for (const f of spec.fields) {
      const have = db.properties[f.prop];
      if (have) {
        const want = notionTypeOf(f);
        if (have.type !== want && !(f.kind === "text" && ["url", "title"].includes(have.type))) {
          report.problems.push(`${spec.db}: "${f.prop}" is ${have.type}, the app expects ${want}.`);
        }
        continue;
      }
      if (spec.existing && !f.add) {
        report.problems.push(`${spec.db}: "${f.prop}" is missing.`);
        continue;
      }
      if (f.target && !dbs[f.target]) continue;
      add[f.prop] = propertySchema(f, dbs);
    }
    for (const m of spec.mirrors ?? []) {
      if (!db.properties[m.prop]) add[m.prop] = m.kind === "number" ? { number: { format: "number" } } : { rich_text: {} };
    }
    if (Object.keys(add).length) {
      await client.request("PATCH", `databases/${id}`, { properties: add });
      report.addedProperties.push(...Object.keys(add).map((p) => `${spec.db}: ${p}`));
    }
  }
  report.databases = dbs;
  return report;
}
