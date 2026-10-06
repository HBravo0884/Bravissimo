import { handle, type Env } from "../../server/api";
import type { FetchLike } from "../../server/notion";

/** Netlify Function: every /api/* request lands here. */
export default async (req: Request): Promise<Response> => {
  const env = ((globalThis as unknown as { process?: { env: Env } }).process?.env ?? {}) as Env;
  return handle(req, env, { fetch: fetch as unknown as FetchLike });
};

export const config = { path: "/api/*" };
