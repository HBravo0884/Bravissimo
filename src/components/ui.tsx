import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { GLYPHS } from "../music/glyphs";

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

/** The student's accent, kept week to week, with white text on it. */
export function Chip({ name, accent, size = 40 }: { name: string; accent: string; size?: number }) {
  return (
    <span className="chip-avatar" aria-hidden="true" style={{ width: size, height: size, fontSize: size * 0.38, background: accent || "var(--accent)" }}>
      {initials(name)}
    </span>
  );
}

const ICONS: Record<string, string> = {
  play: "M8 5.5v13l11-6.5z",
  today: "M7 3v3m10-3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm3 7h3v3H8z",
  board: "M4 4h7v7H4zm9 0h7v7h-7zM4 13h7v7H4zm9 0h7v7h-7z",
  people: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 10a7 7 0 0 1 14 0m1-10a3.5 3.5 0 1 0-1.5-6.7M22 21a6 6 0 0 0-4.5-5.8",
  more: "M4 7h16M4 12h16M4 17h16",
  gear: "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm8-3.5a8 8 0 0 0-.1-1.2l2-1.6-2-3.4-2.4.9a8 8 0 0 0-2-1.2L15 3h-4l-.5 2.5a8 8 0 0 0-2 1.2l-2.4-.9-2 3.4 2 1.6a8 8 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-.9a8 8 0 0 0 2 1.2L11 21h4l.5-2.5a8 8 0 0 0 2-1.2l2.4.9 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z",
  back: "M15 5l-7 7 7 7",
  next: "M9 5l7 7-7 7",
  close: "M6 6l12 12M18 6 6 18",
  plus: "M12 5v14M5 12h14",
  check: "M5 12.5l4.5 4.5L19 7.5",
  sync: "M20 11a8 8 0 0 0-14.3-4.9L4 8m0-4v4h4m-4 5a8 8 0 0 0 14.3 4.9L20 16m0 4v-4h-4",
  warn: "M12 9v4m0 3.5v.5M10.3 4.2 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z",
  trash: "M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13",
  copy: "M8 8h11v12H8zM5 16V4h11",
  download: "M12 4v11m0 0 4-4m-4 4-4-4M5 19h14",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  print: "M7 9V4h10v5M7 17H5a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2M7 14h10v6H7z",
  edit: "M4 20h4L19 9l-4-4L4 16v4Zm9-13 4 4",
  mic: "M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm-6-3a6 6 0 0 0 12 0M12 18v3",
  doc: "M7 3h7l5 5v13H7zM14 3v5h5M10 13h6m-6 4h6",
  ladder: "M7 3v18M17 3v18M7 7h10M7 12h10M7 17h10",
  sound: "M4 9v6h4l5 4V5L8 9H4zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z",
  mute: "M4 9v6h4l5 4V5L8 9H4zm12 0 5 6m0-6-5 6",
  sun: "M12 4V2m0 20v-2m8-8h2M2 12h2m13.7-5.7 1.4-1.4M4.9 19.1l1.4-1.4m0-11.4L4.9 4.9m14.2 14.2-1.4-1.4M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z",
  moon: "M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z",
  lock: "M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z",
  up: "M12 19V5m0 0-6 6m6-6 6 6",
  down: "M12 5v14m0 0-6-6m6 6 6-6",
  thread: "M4 6h16M4 12h10M4 18h13",
  promise: "M5 4h14v16l-7-4-7 4z",
};

export function Icon({ name, size = 22, label }: { name: string; size?: number; label?: string }) {
  const filled = name === "play" || name === "sound";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={ICONS[name] ?? ""} />
    </svg>
  );
}

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="var(--c1)" />
      <path d="M12 22.5V9.5l10-2.5v13" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinejoin="round" />
      <ellipse cx="9.5" cy="22.5" rx="3.5" ry="2.6" fill="#fff" />
      <ellipse cx="19.5" cy="20" rx="3.5" ry="2.6" fill="#fff" />
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

/** Ten blocks, like the notebook's Challenge Tracker. */
export function Blocks({ filled, label }: { filled: number; label: string }) {
  return (
    <div className="blocks" role="img" aria-label={`${label}: ${filled} of 10 blocks`}>
      {Array.from({ length: 10 }, (_, i) => (
        <span key={i} className={i < filled ? "on" : ""} />
      ))}
    </div>
  );
}

/** A dialog that slides up from the bottom on phones. Closes on Escape or backdrop tap. */
export function Sheet({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
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
      className={`sheet ${wide ? "wide" : ""}`}
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

/** A labelled text field that saves when it loses focus, so typing never waits on a sync. */
export function TextField({
  label,
  value,
  onSave,
  multiline,
  placeholder,
  hint,
  type = "text",
  disabled,
  rows,
}: {
  label: string;
  value: string;
  onSave: (v: string) => void;
  multiline?: boolean;
  placeholder?: string;
  hint?: ReactNode;
  type?: string;
  disabled?: boolean;
  rows?: number;
}) {
  const id = useId();
  const [v, setV] = useState(value);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setV(value);
  }, [value]);
  const commit = () => {
    focused.current = false;
    if (v !== value) onSave(v);
  };
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      {multiline ? (
        <textarea
          id={id}
          className="input"
          value={v}
          rows={rows ?? 2}
          placeholder={placeholder}
          disabled={disabled}
          onFocus={() => (focused.current = true)}
          onChange={(e) => setV(e.target.value)}
          onBlur={commit}
        />
      ) : (
        <input
          id={id}
          className="input"
          type={type}
          value={v}
          placeholder={placeholder}
          disabled={disabled}
          onFocus={() => (focused.current = true)}
          onChange={(e) => setV(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
        />
      )}
      {hint && <small className="hint">{hint}</small>}
    </label>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  hint,
}: {
  label: string;
  value: T;
  options: readonly (T | { id: T; label: string })[];
  onChange: (v: T) => void;
  hint?: ReactNode;
}) {
  const id = useId();
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => {
          const opt = typeof o === "string" ? { id: o, label: o || "None" } : o;
          return (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          );
        })}
      </select>
      {hint && <small className="hint">{hint}</small>}
    </label>
  );
}

export function Tabs<T extends string>({ value, tabs, onChange, label }: { value: T; tabs: { id: T; label: string; count?: number }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={t.id === value} onClick={() => onChange(t.id)}>
          {t.label}
          {t.count ? <span className="count">{t.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

/** Seven day boxes: four plain and three dashed, as on the printed card. */
export function DayBoxes({
  ticked,
  onToggle,
  accent,
  label,
  disabled,
}: {
  ticked: Set<number>;
  onToggle?: (day: number, on: boolean) => void;
  accent: string;
  label: string;
  disabled?: boolean;
}) {
  return (
    <div className="dayboxes" role="group" aria-label={label} style={{ ["--box" as string]: accent || "var(--accent)" }}>
      {[1, 2, 3, 4, 5, 6, 7].map((d) => {
        const on = ticked.has(d);
        return (
          <button
            key={d}
            type="button"
            className={`daybox ${d > 4 ? "dashed" : ""} ${on ? "on" : ""}`}
            aria-pressed={on}
            aria-label={`Practice day ${d}`}
            disabled={disabled || !onToggle}
            onClick={() => onToggle?.(d, !on)}
          >
            {on && <Icon name="check" size={18} />}
          </button>
        );
      })}
    </div>
  );
}

export function relativeDay(iso: string | undefined, now = new Date()): string {
  if (!iso) return "never";
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  const days = Math.floor((new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days === -1) return "tomorrow";
  if (days > 1 && days < 7) return `${days} days ago`;
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

export function Empty({ children }: { children: ReactNode }) {
  return <div className="card empty">{children}</div>;
}

/** Copies text and says so for a moment. */
export function CopyButton({ text, label = "Copy", small }: { text: string; label?: string; small?: boolean }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={`btn ${small ? "btn-sm" : ""}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1600);
        } catch {
          setDone(false);
        }
      }}
    >
      <Icon name={done ? "check" : "copy"} size={18} /> {done ? "Copied" : label}
    </button>
  );
}

export function download(name: string, text: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
