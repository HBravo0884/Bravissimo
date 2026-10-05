import { useEffect, useRef, type ReactNode } from "react";
import type { Student } from "../data/model";
import { POINTS_PER_LEVEL } from "../data/levelup";
import type { Badge } from "../data/badges";
import { GLYPHS } from "../music/glyphs";

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

export function Avatar({ student, size = 44 }: { student: Pick<Student, "name" | "color">; size?: number }) {
  const c = ((student.color % 8) + 8) % 8;
  return (
    <span
      className="avatar"
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: size * 0.38, background: `var(--avatar-${c})`, color: `var(--avatar-ink-${c})` }}
    >
      {initials(student.name)}
    </span>
  );
}

const ICONS: Record<string, string> = {
  play: "M8 5.5v13l11-6.5z",
  chart: "M4 20V10m6 10V4m6 16v-7m4 7H2",
  gear: "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm8-3.5a8 8 0 0 0-.1-1.2l2-1.6-2-3.4-2.4.9a8 8 0 0 0-2-1.2L15 3h-4l-.5 2.5a8 8 0 0 0-2 1.2l-2.4-.9-2 3.4 2 1.6a8 8 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-.9a8 8 0 0 0 2 1.2L11 21h4l.5-2.5a8 8 0 0 0 2-1.2l2.4.9 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z",
  back: "M15 5l-7 7 7 7",
  close: "M6 6l12 12M18 6 6 18",
  plus: "M12 5v14M5 12h14",
  sound: "M4 9v6h4l5 4V5L8 9H4zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z",
  mute: "M4 9v6h4l5 4V5L8 9H4zm12 0 5 6m0-6-5 6",
  sun: "M12 4V2m0 20v-2m8-8h2M2 12h2m13.7-5.7 1.4-1.4M4.9 19.1l1.4-1.4m0-11.4L4.9 4.9m14.2 14.2-1.4-1.4M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z",
  moon: "M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z",
  share: "M12 3v12m0-12 4 4m-4-4L8 7M5 13v6h14v-6",
  check: "M5 12.5l4.5 4.5L19 7.5",
  lock: "M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z",
  people: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 10a7 7 0 0 1 14 0m1-10a3.5 3.5 0 1 0-1.5-6.7M22 21a6 6 0 0 0-4.5-5.8",
};

export function Icon({ name, size = 22 }: { name: keyof typeof ICONS | string; size?: number }) {
  const filled = name === "play" || name === "sound";
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={filled ? 0 : 2} strokeLinecap="round" strokeLinejoin="round">
      <path d={ICONS[name] ?? ""} />
    </svg>
  );
}

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="var(--accent)" />
      <path d="M12 22.5V9.5l10-2.5v13" fill="none" stroke="var(--on-accent)" strokeWidth="2.4" strokeLinejoin="round" />
      <ellipse cx="9.5" cy="22.5" rx="3.5" ry="2.6" fill="var(--on-accent)" />
      <ellipse cx="19.5" cy="20" rx="3.5" ry="2.6" fill="var(--on-accent)" />
    </svg>
  );
}

export function Stat({ k, v, sub }: { k: string; v: ReactNode; sub?: ReactNode }) {
  return (
    <div className="stat">
      <div className="k">{k}</div>
      <div className="v num">
        {v}
        {sub !== undefined && <small> {sub}</small>}
      </div>
    </div>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { id: T; label: ReactNode }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.id)} type="button" aria-pressed={o.id === value} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Progress({ value, max, tone, label }: { value: number; max: number; tone?: "good"; label: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className={`progress ${tone ?? ""}`} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.round(value)}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Ten segments of 100 points, like the notebook's blocks. */
export function LevelBar({ points }: { points: number }) {
  return (
    <div className="levelbar" role="progressbar" aria-label="Points this level" aria-valuemin={0} aria-valuemax={POINTS_PER_LEVEL} aria-valuenow={points}>
      {Array.from({ length: 10 }, (_, i) => {
        const fill = Math.max(0, Math.min(1, (points - i * 100) / 100));
        return (
          <span key={i}>
            <i style={{ width: `${fill * 100}%` }} />
          </span>
        );
      })}
    </div>
  );
}

/** A dialog that slides up from the bottom on phones. Closes on Escape or backdrop tap. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="sheet"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-label={title}
    >
      {open && (
        <div className="sheet-body">
          <div className="spread">
            <h2>{title}</h2>
            <button className="btn btn-ghost btn-sm" type="button" onClick={onClose} aria-label="Close">
              <Icon name="close" />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

export function BadgeGrid({ all, earned }: { all: Badge[]; earned: Set<string> }) {
  return (
    <div className="badges">
      {all.map((b) => (
        <div key={b.id} className={`badge ${earned.has(b.id) ? "" : "locked"}`} title={b.description}>
          <span className="ic" aria-hidden="true">
            {b.icon}
          </span>
          <div>
            <b>{b.name}</b>
            <span>{earned.has(b.id) ? b.description : `Locked: ${b.description.toLowerCase()}`}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function relativeDay(iso: string | undefined, now = new Date()): string {
  if (!iso) return "never";
  const d = new Date(iso);
  const days = Math.floor((new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatMinutes(min: number): string {
  if (min < 1) return `${Math.round(min * 60)}s`;
  if (min < 60) return `${Math.round(min)} min`;
  return `${Math.floor(min / 60)}h ${Math.round(min % 60)}m`;
}

/** Text with ♯ and ♭ drawn as engraved glyphs, which UI fonts render tiny or not at all. */
export function MusicLabel({ text }: { text: string }) {
  const parts = text.split(/([♯♭])/);
  return (
    <>
      {parts.map((p, i) =>
        p === "♯" || p === "♭" ? (
          <svg key={i} className="acc" viewBox={p === "♯" ? "0 -360 250 720" : "0 -460 230 660"} aria-label={p === "♯" ? "sharp" : "flat"} role="img">
            <path d={GLYPHS[p === "♯" ? "accidentalSharp" : "accidentalFlat"].d} transform="scale(1 -1)" />
          </svg>
        ) : (
          p
        ),
      )}
    </>
  );
}
