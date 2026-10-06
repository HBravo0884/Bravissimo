import { store, useSync } from "../data/store";
import { href } from "../router";
import { Icon } from "./ui";

/** Where the record stands: saved to Notion, waiting, offline, or needing attention. */
export function SyncBadge() {
  const s = useSync();
  if (s.mode === "demo") return null;
  if (s.failed)
    return (
      <a className="sync-badge bad" href={href("/settings")}>
        <Icon name="warn" size={16} /> <span>Not saved</span>
      </a>
    );
  if (s.status === "signed out")
    return (
      <a className="sync-badge warn" href={href("/settings")}>
        <Icon name="lock" size={16} /> Sign in
      </a>
    );
  const label =
    s.status === "syncing"
      ? "Saving"
      : s.status === "offline"
        ? s.pending
          ? `Offline, ${s.pending} to send`
          : "Offline"
        : s.status === "error"
          ? "Not saved"
          : s.pending
            ? `${s.pending} to send`
            : "Saved to Notion";
  const tone = s.status === "error" ? "bad" : s.status === "offline" || s.pending ? "warn" : "good";
  return (
    <button
      type="button"
      className={`sync-badge ${tone}`}
      onClick={() => void store.pull()}
      title={s.message || (s.lastSync ? `Last synced ${new Date(s.lastSync).toLocaleTimeString()}` : "Sync now")}
      aria-label={`${label}. Sync now`}
    >
      <Icon name={s.status === "error" ? "warn" : "sync"} size={16} />
      <span>{label}</span>
    </button>
  );
}
