import { useState } from "react";
import { store, useSync } from "../../data/store";
import { AGE_BANDS, FERN, FLAGS, POINTS_MODES, type Student } from "../../../shared/types";
import { CopyButton, SelectField, TextField } from "../../components/ui";
import { familyUrl } from "../StudentRecord";

const ACCENTS = ["#097C87", "#065E68", "#1C7294", "#1B6D5E", "#317F73", "#D22B27", "#9B1414", "#084365"];

/** sRGB contrast of white text on a colour; the studio rule is 4.5:1. */
export function whiteContrast(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const L = 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  return 1.05 / (L + 0.05);
}

function bandFromAge(age: number | null): string {
  if (age == null) return "";
  if (age < 8) return "under 8";
  if (age <= 10) return "8 to 10";
  if (age <= 13) return "11 to 13";
  if (age <= 17) return "14 to 17";
  return "adult";
}

export function Profile({ student }: { student: Student }) {
  const sync = useSync();
  const up = (patch: Partial<Student>) => store.update("students", student.id, patch);
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkError, setLinkError] = useState("");
  const contrast = whiteContrast(student.accent);
  const band = student.ageBand || bandFromAge(student.age);

  return (
    <div className="stack">
      <section className="card pad stack">
        <h2>On the sheet</h2>
        <div className="grid-2">
          <TextField label="Name on the sheet" value={student.displayName} placeholder={student.name.split(/\s+/)[0]} onSave={(v) => up({ displayName: v.trim() })} hint="The name the student goes by." />
          <TextField label="Full name" value={student.name} onSave={(v) => v.trim() && up({ name: v.trim() })} hint="As Opus1 has it; names the playlist." />
          <SelectField label="Sheet language" value={student.lang} options={[{ id: "en", label: "English" }, { id: "es", label: "Spanish" }]} onChange={(v) => up({ lang: v })} />
          <SelectField label="The adult at home reads" value={student.familyLang} options={[{ id: "en", label: "English" }, { id: "es", label: "Spanish" }]} onChange={(v) => up({ familyLang: v })} />
          <TextField label="Adult's name for reports" value={student.adultName} onSave={(v) => up({ adultName: v.trim() })} hint='Used in the "For ..." line. Nothing else about the family is kept.' />
          <TextField label="Playlist link" value={student.playlist} onSave={(v) => up({ playlist: v.trim() })} type="url" />
        </div>
        <div className="field">
          <span>Accent</span>
          <div className="row-wrap">
            {ACCENTS.map((a) => (
              <button key={a} type="button" className={`swatch-button ${student.accent.toLowerCase() === a.toLowerCase() ? "on" : ""}`} style={{ background: a }} aria-label={`Accent ${a}`} aria-pressed={student.accent.toLowerCase() === a.toLowerCase()} onClick={() => up({ accent: a })} />
            ))}
            <input className="input color-input" type="color" value={/^#[0-9a-f]{6}$/i.test(student.accent) ? student.accent : "#097c87"} onChange={(e) => up({ accent: e.target.value })} aria-label="Any accent" />
          </div>
          <small className={`hint ${contrast && contrast < 4.5 ? "bad-text" : ""}`}>
            {student.accent ? `White chip text holds ${contrast.toFixed(1)}:1${contrast < 4.5 ? "; the rule is 4.5:1, pick a darker one" : ""}.` : "Kept week to week."}
          </small>
        </div>
      </section>

      <section className="card pad stack">
        <h2>Points</h2>
        <SelectField
          label="Level Up"
          value={student.pointsMode}
          options={POINTS_MODES}
          onChange={(v) => up({ pointsMode: v })}
          hint={student.pointsMode === "plays for points" ? "Cards carry codes; open challenges sit in one block." : "No codes, no points and no challenges block, on paper and on the family page."}
        />
        <TextField label="Level Up (teacher only, never printed)" value={student.levelUp} onSave={(v) => up({ levelUp: v.trim() })} hint="Assigning a level is your decision alone. Challenge templates use this digit." />
      </section>

      <section className="card pad stack">
        <h2>Teaching notes</h2>
        <div className="grid-2">
          <SelectField label="FERN focus" value={student.fern} options={["", ...FERN]} onChange={(v) => up({ fern: v })} hint="The one thing we are fixing right now." />
          <SelectField label="Age band" value={band as (typeof AGE_BANDS)[number] | ""} options={["", ...AGE_BANDS]} onChange={(v) => up({ ageBand: v })} hint={student.age != null ? `Notion has age ${student.age}.` : "The routine for under 8 can total 15 or 20."} />
          <SelectField label="Piano Adventures book" value={student.paBook} options={["", "Primer", "1", "2A", "2B", "3A", "3B", "4", "5"]} onChange={(v) => up({ paBook: v })} />
          <TextField label="Current sprint" value={student.sprint} onSave={(v) => up({ sprint: v })} />
        </div>
        <div className="field">
          <span>Flags</span>
          {FLAGS.map((f) => (
            <label key={f} className="check">
              <input type="checkbox" checked={student.flags.includes(f)} onChange={(e) => up({ flags: e.target.checked ? [...student.flags, f] : student.flags.filter((x) => x !== f) })} />
              {f}
            </label>
          ))}
          <small className="hint">A flag beats a practice prescription.</small>
        </div>
        {student.prescription.length > 0 && <p className="small">Practice prescription in Notion: {student.prescription.join(", ")}.</p>}
        <div className="grid-3">
          <TextField label="Span, 1 to 5 (white keys)" value={student.span15 == null ? "" : String(student.span15)} type="number" onSave={(v) => up({ span15: v === "" ? null : Number(v), spanOn: student.spanOn || new Date().toISOString().slice(0, 10) })} />
          <TextField label="Span, 1 to 4" value={student.span14 == null ? "" : String(student.span14)} type="number" onSave={(v) => up({ span14: v === "" ? null : Number(v) })} />
          <TextField label="Taken on" value={student.spanOn} type="date" onSave={(v) => up({ spanOn: v })} />
        </div>
        <SelectField label="Status" value={student.status} options={["Active", "Pause", "Discontinued"]} onChange={(v) => up({ status: v })} hint="On hold gets no sheet." />
      </section>

      <section className="card pad stack-sm">
        <h2>Family link</h2>
        <p className="muted small">A private link behind the sheet's code, with no account. It shows this week's checked sheet in the family's language and nothing else. Reset it any time; the old link stops working.</p>
        {student.familyKey ? (
          <div className="stack-sm">
            <code className="linkbox">{familyUrl(student.familyKey)}</code>
            <div className="btn-row">
              <CopyButton text={familyUrl(student.familyKey)} label="Copy link" small />
              <a className="btn btn-sm" href={familyUrl(student.familyKey)} target="_blank" rel="noreferrer">
                Open
              </a>
            </div>
          </div>
        ) : (
          <p className="small">No link yet.</p>
        )}
        <div className="btn-row">
          <button
            className="btn btn-sm"
            type="button"
            disabled={linkBusy || (sync.mode === "notion" && sync.status === "offline")}
            onClick={async () => {
              if (student.familyKey && !window.confirm("Reset the link? The one on printed sheets stops working.")) return;
              setLinkBusy(true);
              setLinkError("");
              try {
                await store.familyLink(student.id);
              } catch (e) {
                setLinkError((e as Error).message);
              } finally {
                setLinkBusy(false);
              }
            }}
          >
            {student.familyKey ? "Reset the link" : "Make the link"}
          </button>
        </div>
        {linkError && <p className="banner">{linkError}</p>}
        {student.familyKeyOn && <p className="tiny muted">Made {student.familyKeyOn}.</p>}
      </section>
    </div>
  );
}
