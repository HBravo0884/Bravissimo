import type { Challenge, Session, Student } from "./model";

/**
 * Links that carry data between devices without a server:
 *  - a join link the teacher sends a student, which sets up their home device;
 *  - a scores link the student sends back, which the teacher opens to import.
 * Payloads are JSON, deflate-compressed where the browser supports it, in base64url.
 */

export interface JoinPayload {
  kind: "join";
  v: 1;
  student: Pick<Student, "id" | "name" | "color" | "levelUp" | "playsForPoints">;
  studio: string;
  teacher: string;
  challenges: Challenge[];
}

export interface ScoresPayload {
  kind: "scores";
  v: 1;
  student: Pick<Student, "id" | "name" | "color">;
  sessions: Session[];
  sentAt: string;
}

export type Payload = JoinPayload | ScoresPayload;

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

const canCompress = () => typeof CompressionStream !== "undefined";

/** "z…" = compressed, "j…" = plain JSON. */
export async function encodePayload(p: Payload): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(p));
  if (canCompress()) return "z" + toBase64Url(await pipe(json, new CompressionStream("deflate-raw")));
  return "j" + toBase64Url(json);
}

export async function decodePayload(code: string): Promise<Payload> {
  const s = code.trim().replace(/^.*#\/(?:join|import)\//, "");
  const body = fromBase64Url(s.slice(1));
  const bytes = s[0] === "z" ? await pipe(body, new DecompressionStream("deflate-raw")) : body;
  const data = JSON.parse(new TextDecoder().decode(bytes));
  if (!data || (data.kind !== "join" && data.kind !== "scores") || data.v !== 1) throw new Error("Not a Bravissimo link");
  return data as Payload;
}

/** Full URL for a route on this deployment. */
export function appUrl(route: string): string {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#${route}`;
}
