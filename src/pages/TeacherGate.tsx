import { useState, type ReactNode } from "react";
import { useDB } from "../data/store";
import { Icon } from "../components/ui";

const UNLOCK_KEY = "bravissimo.teacher-unlocked";

export async function hashPin(pin: string): Promise<string> {
  const bytes = new TextEncoder().encode(`bravissimo:${pin}`);
  if (crypto?.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  // Non-secure contexts (plain http on a LAN) have no SubtleCrypto; fall back to a simple hash.
  let h = 2166136261;
  for (const b of bytes) h = Math.imul(h ^ b, 16777619);
  return `fnv-${(h >>> 0).toString(16)}`;
}

function isUnlocked(): boolean {
  try {
    return sessionStorage.getItem(UNLOCK_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Keeps students on a shared studio device out of the teacher pages when a PIN is set.
 * This is a convenience lock, not security: the data lives on the device itself.
 */
export function TeacherGate({ children }: { children: ReactNode }) {
  const pinHash = useDB((db) => db.settings.teacherPinHash);
  const [ok, setOk] = useState(() => !pinHash || isUnlocked());
  const [pin, setPin] = useState("");
  const [err, setErr] = useState(false);

  if (!pinHash || ok) return <>{children}</>;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((await hashPin(pin)) === pinHash) {
      try {
        sessionStorage.setItem(UNLOCK_KEY, "1");
      } catch {
        /* still unlock for this page view */
      }
      setOk(true);
    } else {
      setErr(true);
      setPin("");
    }
  };

  return (
    <form className="card pad stack" style={{ maxWidth: 380, margin: "8vh auto" }} onSubmit={submit}>
      <div className="row">
        <Icon name="lock" />
        <h2>Teacher area</h2>
      </div>
      <label className="field">
        <span>PIN</span>
        <input
          className="input num"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          value={pin}
          onChange={(e) => {
            setPin(e.target.value);
            setErr(false);
          }}
        />
      </label>
      {err && <p className="pill pill-bad">That PIN didn't match.</p>}
      <button className="btn btn-primary" type="submit" disabled={!pin}>
        Unlock
      </button>
    </form>
  );
}
