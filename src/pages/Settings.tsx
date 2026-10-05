import { useRef, useState } from "react";
import { store, useDB } from "../data/store";
import { buildDemoStudio } from "../data/demo";
import { download, sessionsCsv, today } from "../data/exporters";
import { decodePayload } from "../data/share";
import { normalizeDB } from "../data/store";
import type { Theme } from "../prefs";
import { navigate } from "../router";
import { Segmented } from "../components/ui";
import { hashPin } from "./TeacherGate";

export function SettingsPage({ theme, onTheme }: { theme: Theme; onTheme: (t: Theme) => void }) {
  const db = useDB((d) => d);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pin, setPin] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const home = db.students.find((s) => s.id === db.settings.homeStudentId);

  const restore = async (file: File) => {
    try {
      const data = normalizeDB(JSON.parse(await file.text()));
      const added = store.importData(data);
      setMsg(`Merged the backup: ${added.students} new students, ${added.sessions} new games, ${added.challenges} new challenges.`);
    } catch {
      setMsg("That file isn't a Bravissimo backup.");
    }
  };

  return (
    <div className="stack" style={{ maxWidth: 760 }}>
      <h1>Settings</h1>
      {msg && (
        <div className="banner" role="status" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
          {msg}
        </div>
      )}

      <section className="card pad stack">
        <h2>Studio</h2>
        <div className="row-wrap">
          <label className="field grow">
            <span>Studio name</span>
            <input className="input" value={db.settings.studioName} onChange={(e) => store.updateSettings({ studioName: e.target.value })} />
          </label>
          <label className="field grow">
            <span>What students call you</span>
            <input className="input" value={db.settings.teacherName} onChange={(e) => store.updateSettings({ teacherName: e.target.value })} />
          </label>
        </div>
      </section>

      <section className="card pad stack">
        <h2>This device</h2>
        <div className="row-wrap">
          <span className="small muted">Theme</span>
          <Segmented
            label="Theme"
            value={theme}
            onChange={onTheme}
            options={[
              { id: "system", label: "Auto" },
              { id: "light", label: "Light" },
              { id: "dark", label: "Dark" },
            ]}
          />
        </div>
        <label className="check">
          <input type="checkbox" checked={db.settings.sound} onChange={(e) => store.updateSettings({ sound: e.target.checked })} />
          <span>Sounds</span>
        </label>
        {home ? (
          <div className="spread">
            <p className="small">
              Set up for <b>{home.name}</b>'s home practice.
            </p>
            <button className="btn btn-sm" type="button" onClick={() => store.updateSettings({ homeStudentId: undefined })}>
              Make this a studio device
            </button>
          </div>
        ) : (
          <p className="small muted">Studio device: everyone picks their name on the start screen.</p>
        )}
      </section>

      <section className="card pad stack">
        <h2>Teacher PIN</h2>
        <p className="small muted">Keeps students on a shared tablet out of the dashboard. It's a lock on the door, not a safe: anyone with the device can still clear its data.</p>
        <form
          className="row-wrap"
          onSubmit={async (e) => {
            e.preventDefault();
            if (pin.length < 4) return;
            store.updateSettings({ teacherPinHash: await hashPin(pin) });
            setPin("");
            setMsg("PIN saved. You'll be asked for it once per visit.");
          }}
        >
          <input className="input num" style={{ maxWidth: 200 }} type="password" inputMode="numeric" placeholder="4+ digits" value={pin} onChange={(e) => setPin(e.target.value)} aria-label="New PIN" />
          <button className="btn" type="submit" disabled={pin.length < 4}>
            {db.settings.teacherPinHash ? "Change PIN" : "Set PIN"}
          </button>
          {db.settings.teacherPinHash && (
            <button className="btn btn-ghost" type="button" onClick={() => store.updateSettings({ teacherPinHash: undefined })}>
              Remove PIN
            </button>
          )}
        </form>
      </section>

      <section className="card pad stack">
        <h2>Scores from home</h2>
        <p className="small muted">Students send a link from their device. Opening it here adds their games; you can also paste the link or code.</p>
        <form
          className="row-wrap"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await decodePayload(code);
              navigate(`/import/${code.trim().replace(/^.*#\/import\//, "")}`);
            } catch {
              setMsg("That doesn't look like a scores link.");
            }
          }}
        >
          <input className="input grow" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Paste a scores link" aria-label="Scores link" />
          <button className="btn" type="submit" disabled={!code.trim()}>
            Open
          </button>
        </form>
      </section>

      <section className="card pad stack">
        <h2>Your data</h2>
        <p className="small muted">
          Everything is saved in this browser, on this device. Nothing is uploaded. Export a backup now and then, and before clearing browser data.
        </p>
        <div className="btn-row">
          <button className="btn btn-primary" type="button" onClick={() => download(`bravissimo-backup-${today()}.json`, JSON.stringify(db, null, 1), "application/json")}>
            Export backup
          </button>
          <button className="btn" type="button" onClick={() => fileRef.current?.click()}>
            Restore or merge a backup
          </button>
          <button className="btn" type="button" disabled={!db.sessions.length} onClick={() => download(`bravissimo-scores-${today()}.csv`, sessionsCsv(db), "text/csv")}>
            Scores as CSV
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void restore(f);
            e.target.value = "";
          }}
        />
        <div className="btn-row">
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => {
              if (!db.students.length || confirm("Replace everything on this device with the demo studio?")) {
                store.replaceAll(buildDemoStudio());
                setMsg("Loaded the demo studio (eight made-up students).");
              }
            }}
          >
            Load demo studio
          </button>
          <button
            className="btn btn-ghost btn-danger"
            type="button"
            onClick={() => {
              const typed = prompt('This erases every student and score on this device. Type ERASE to confirm.');
              if (typed === "ERASE") {
                store.replaceAll(normalizeDB({ settings: db.settings }));
                setMsg("Erased. Settings were kept.");
              }
            }}
          >
            Erase all data
          </button>
        </div>
      </section>

      <p className="tiny muted">
        Bravissimo · Music glyphs from Bravura © Steinberg, SIL Open Font License. Level Up is the Expressions Music Academy program; challenge codes and point rules follow the studio's booklet.
      </p>
    </div>
  );
}
