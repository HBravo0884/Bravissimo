/**
 * A small Notion REST client. It retries when Notion asks it to slow down
 * (about three requests a second per integration) and on passing server errors.
 */

export const NOTION_VERSION = "2022-06-28";

export interface NotionError extends Error {
  status: number;
  code: string;
}

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<{
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
  text(): Promise<string>;
}>;

export interface NotionClient {
  request<T = Record<string, unknown>>(method: "GET" | "POST" | "PATCH", path: string, body?: unknown): Promise<T>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function notionClient(token: string, fetchImpl: FetchLike, opts: { maxRetries?: number; baseDelayMs?: number } = {}): NotionClient {
  const maxRetries = opts.maxRetries ?? 3;
  const base = opts.baseDelayMs ?? 400;
  return {
    async request<T>(method: "GET" | "POST" | "PATCH", path: string, body?: unknown): Promise<T> {
      for (let attempt = 0; ; attempt++) {
        const res = await fetchImpl(`https://api.notion.com/v1/${path.replace(/^\//, "")}`, {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            "Notion-Version": NOTION_VERSION,
            "Content-Type": "application/json",
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        if (res.status >= 200 && res.status < 300) return (await res.json()) as T;
        const retryable = res.status === 429 || res.status >= 500;
        if (retryable && attempt < maxRetries) {
          const after = Number(res.headers.get("retry-after"));
          await sleep(Number.isFinite(after) && after > 0 ? Math.min(after, 5) * 1000 : base * 2 ** attempt);
          continue;
        }
        let code = "error";
        let message = `Notion answered ${res.status}`;
        try {
          const j = (await res.json()) as { code?: string; message?: string };
          code = j.code ?? code;
          message = j.message ?? message;
        } catch {
          /* not JSON */
        }
        const err = new Error(message) as NotionError;
        err.status = res.status;
        err.code = code;
        throw err;
      }
    },
  };
}

export interface PageObject {
  object: "page";
  id: string;
  last_edited_time: string;
  archived?: boolean;
  in_trash?: boolean;
  properties: Record<string, PropertyValue>;
}

export type PropertyValue = { id?: string; type: string } & Record<string, unknown>;

interface ListResult<T> {
  results: T[];
  has_more: boolean;
  next_cursor: string | null;
}

/** Queries a database, following cursors up to `maxPages` pages of 100. */
export async function queryDatabase(
  client: NotionClient,
  databaseId: string,
  body: { filter?: unknown; sorts?: unknown; start_cursor?: string } = {},
  maxPages = 5,
): Promise<{ pages: PageObject[]; next: string | null }> {
  const pages: PageObject[] = [];
  let cursor = body.start_cursor;
  for (let i = 0; i < maxPages; i++) {
    const res = await client.request<ListResult<PageObject>>("POST", `databases/${databaseId}/query`, {
      ...body,
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
    });
    pages.push(...res.results.filter((p) => p.object === "page"));
    if (!res.has_more || !res.next_cursor) return { pages, next: null };
    cursor = res.next_cursor;
  }
  return { pages, next: cursor ?? null };
}

export interface BlockObject {
  id: string;
  type: string;
  has_children?: boolean;
  child_database?: { title: string };
  child_page?: { title: string };
}

export async function listChildren(client: NotionClient, blockId: string, maxPages = 10): Promise<BlockObject[]> {
  const out: BlockObject[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < maxPages; i++) {
    const q = `blocks/${blockId}/children?page_size=100${cursor ? `&start_cursor=${encodeURIComponent(cursor)}` : ""}`;
    const res = await client.request<ListResult<BlockObject>>("GET", q);
    out.push(...res.results);
    if (!res.has_more || !res.next_cursor) break;
    cursor = res.next_cursor;
  }
  return out;
}

/** Notion ids arrive with or without dashes; compare them without. */
export function sameId(a: string, b: string): boolean {
  return a.replace(/-/g, "").toLowerCase() === b.replace(/-/g, "").toLowerCase();
}
