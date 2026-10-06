import { useEffect, useState } from "react";
import { apiBase, store, studioSnapshot, useData, useSync } from "../data/store";
import { fromRecord, matchRecord, recordChallenges, type RecordJSON } from "../../shared/records";
import type { Student } from "../../shared/types";
import { isoDate } from "../../shared/dates";
import { weekTitle } from "../data/actions";
import { Icon, Segmented } from "../components/ui";
import type { Theme } from "../prefs";

async function callApi(path: string, method: string, key?: string) {
  const res = await fetch(`${apiBase}${path}`, { method, headers: { "Content-Type": "application/json", ...(key ? { "x-studio-key": key } : {}) } });
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  return { status: res.status, body };
}

interface SetupReport {
  created: string[];
  addedProperties: string[];
  problems: string[];
  databases: Record<string, boolean>;
}

export function SettingsPage({ theme, onTheme, signInFirst }: { theme: Theme; onTheme: (t: Theme) => void; signInFirst?: boolean }) {
  const sync = useSync();
  const [server, setServer] = useState<"checking" | "ready" | "missing">("checking");
  const [key, setKey] = useState(store.key());
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<{ databases: Record<string, boolean>; missing: string[] } | null>(null);
  const [report, setReport] = useState<SetupReport | null>(null);
  const snap = studioSnapshot();

  useEffect(() => {
    callApi("/status", "GET")
      .then((r) => setServer(r.status === 200 && r.body.configured ? "ready" : "missing"))
      .catch(() => setServer("missing"));
  }, []);

  const signIn = async () => {
    setBusy("signin");
    setMessage("");
    try {
      const r = await callApi("/status", "GET", key.trim());
      if (r.status === 401) setMessage("That studio key is not right.");
      else if (r.status !== 200) setMessage(String(r.body.error ?? "The server could not reach Notion."));
      else {
        setStatus(r.body as unknown as { databases: Record<string, boolean>; missing: string[] });
        store.connect("notion", key.trim());
        void store.pull();
      }
    } catch {
      setMessage("The server could not be reached. Check the connection.");
    } finally {
      setBusy("");
    }
  };

  const runSetup = async () => {
    setBusy("setup");
    setMessage("");
    try {
      const r = await callApi("/setup", "POST", store.key());
      if (r.status !== 200) setMessage(String(r.body.error ?? "Setup did not finish."));
      else {
        setReport(r.body as unknown as SetupReport);
        void store.refreshAll();
      }
    } catch {
      setMessage("The server could not be reached.");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="stack page-narrow">
      <header className="page-head">
        <span className="eyebrow">Settings</span>
        <h1>{signInFirst ? "Sign in to the studio" : "Where the record lives"}</h1>
      </header>

      {!signInFirst && (
        <section className="card pad stack-sm">
          <h2>Record</h2>
          <Segmented
            label="Where the record lives"
            value={sync.mode}
            options={[
              { id: "demo", label: snap ? "This snapshot" : "Demo studio" },
              { id: "notion", label: "Notion" },
            ]}
            onChange={(m) => store.connect(m, m === "notion" ? key : "")}
          />
          <p className="muted small">
            {sync.mode === "demo"
              ? snap
                ? "A copy of your studio, kept on this device only. Nothing reaches Notion or a family."
                : "Invented students, kept on this device only. Nothing reaches Notion or a family."
              : "Your Notion Student tracker. Changes save on this device first and reach Notion when there is a connection."}
          </p>
        </section>
      )}

      {sync.mode === "notion" && (
        <section className="card pad stack">
          <div className="spread">
            <h2>Notion</h2>
            <span className={`pill ${server === "ready" ? "pill-good" : server === "missing" ? "pill-warn" : ""}`}>
              {server === "ready" ? "Server ready" : server === "missing" ? "Server not set up" : "Checking"}
            </span>
          </div>
          {server === "missing" && <SetupSteps />}
          <label className="field">
            <span>Studio key</span>
            <input className="input" type="password" autoComplete="current-password" value={key} onChange={(e) => setKey(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void signIn()} />
            <small className="hint">The STUDIO_KEY you set on Netlify. This device remembers it; families never need it.</small>
          </label>
          <div className="btn-row">
            <button className="btn btn-primary" type="button" disabled={!key.trim() || busy === "signin"} onClick={signIn}>
              {busy === "signin" ? "Checking" : sync.status === "signed out" ? "Sign in" : "Check again"}
            </button>
            {sync.status !== "signed out" && (
              <button className="btn" type="button" disabled={busy === "setup"} onClick={runSetup}>
                <Icon name="sync" size={18} /> {busy === "setup" ? "Setting up" : "Set up Notion"}
              </button>
            )}
          </div>
          {message && (
            <p className="banner" role="alert">
              {message}
            </p>
          )}
          {sync.failed && (
            <div className="banner stack-sm" role="alert">
              <p>
                Notion refused a change to {sync.failed.collection}: {sync.failed.error || "no reason given"}. Changes after it are waiting.
              </p>
              <div className="btn-row">
                <button className="btn btn-sm" type="button" onClick={() => void store.flush()}>
                  Try again
                </button>
                <button className="btn btn-sm btn-ghost" type="button" onClick={() => window.confirm("Drop that one change? Everything else still goes to Notion.") && store.discardFailed()}>
                  Drop that change
                </button>
              </div>
            </div>
          )}
          {status && (
            <p className="small">
              {status.missing.length ? `Found ${Object.values(status.databases).filter(Boolean).length} of ${Object.keys(status.databases).length} databases. Run Set up Notion to add the rest.` : "Every database is in place."}
            </p>
          )}
          {report && <SetupResult report={report} />}
          {sync.status !== "signed out" && (
            <div className="btn-row">
              <button className="btn btn-sm" type="button" onClick={() => void store.refreshAll()}>
                Reload everything from Notion
              </button>
              <button
                className="btn btn-sm btn-ghost"
                type="button"
                onClick={() => {
                  if (sync.pending && !window.confirm(`${sync.pending} changes have not reached Notion yet. Sign out anyway?`)) return;
                  store.connect("notion", "");
                  setKey("");
                }}
              >
                Sign out on this device
              </button>
            </div>
          )}
        </section>
      )}

      {!signInFirst && sync.mode === "demo" && (
        <section className="card pad stack-sm">
          <h2>{snap ? snap.label : "Demo studio"}</h2>
          <p className="muted small">
            {snap
              ? `Taken ${snap.takenOn}. Changes stay on this device and never reach Notion or a family. Try anything; reset when you like.`
              : "Eight invented students with this week's sheets, lessons, threads and promises. Try anything; reset when you like."}
          </p>
          <div className="btn-row">
            <button className="btn btn-sm" type="button" onClick={() => window.confirm(snap ? "Put the snapshot back the way it was taken?" : "Put the demo studio back the way it started?") && store.resetDemo()}>
              {snap ? "Reset the snapshot" : "Reset the demo"}
            </button>
          </div>
        </section>
      )}

      {!signInFirst && <ImportRecords />}

      {!signInFirst && (
        <section className="card pad stack-sm">
          <h2>This device</h2>
          <Segmented
            label="Theme"
            value={theme}
            options={[
              { id: "system", label: "Match device" },
              { id: "light", label: "Light" },
              { id: "dark", label: "Dark" },
            ]}
            onChange={onTheme}
          />
          {sync.mode === "notion" && (
            <button
              className="btn btn-sm btn-ghost"
              type="button"
              onClick={() => {
                if (sync.pending) {
                  window.alert(`${sync.pending} changes have not reached Notion yet. Sync first.`);
                  return;
                }
                if (window.confirm("Forget this device's copy? Notion keeps everything; it loads again on the next sync.")) {
                  store.clearLocal();
                  void store.refreshAll();
                }
              }}
            >
              Forget this device's copy
            </button>
          )}
        </section>
      )}
    </div>
  );
}

function SetupSteps() {
  return (
    <ol className="steps small">
      <li>
        In Notion, open <b>Settings, Connections, Develop or manage integrations</b> and make an internal integration called Bravissimo. Copy its secret.
      </li>
      <li>
        On the <b>Student tracker</b> page, open the menu, choose <b>Connections</b> and add Bravissimo. That shares the tracker and everything under it.
      </li>
      <li>
        On Netlify, in the site's <b>Environment variables</b>, add <code>NOTION_TOKEN</code> (the secret), <code>NOTION_ROOT_PAGE</code> (the Student tracker page id, the 32 characters at the end of its link) and <code>STUDIO_KEY</code> (a long passphrase only you know). Redeploy.
      </li>
      <li>Come back here, type the studio key and choose Set up Notion. It adds the app's databases on a Bravissimo page inside the tracker and never removes anything.</li>
    </ol>
  );
}

function SetupResult({ report }: { report: SetupReport }) {
  return (
    <div className="stack-sm small">
      {report.created.length > 0 && <p>Created: {report.created.join(", ")}.</p>}
      {report.addedProperties.length > 0 && <p>Added {report.addedProperties.length} properties: {report.addedProperties.join("; ")}.</p>}
      {!report.created.length && !report.addedProperties.length && <p>Nothing to add. The tracker was already set up.</p>}
      {report.problems.length > 0 && (
        <div className="banner">
          {report.problems.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
      )}
    </div>
  );
}

/** The import of the latest records packs: each entry becomes that student's sheet for the date, with its open challenges. */
function ImportRecords() {
  const students = useData("students");
  const weeks = useData("weeks");
  const challenges = useData("challenges");
  const [entries, setEntries] = useState<Partial<RecordJSON>[]>([]);
  const [date, setDate] = useState(isoDate());
  const [done, setDone] = useState("");
  return (
    <section className="card pad stack-sm">
      <h2>Import a records file</h2>
      <p className="muted small">
        A students_*.json pack from the weekly run, or a one-student revision. Each entry becomes that student's sheet for the date below, marked printed, with its open challenges. Students are found by
        the name on the sheet, then by the slot. The file stays on this device.
      </p>
      <div className="row-wrap">
        <input
          className="input"
          type="file"
          accept="application/json,.json"
          aria-label="Records file"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            setDone("");
            if (!f) return;
            try {
              const parsed = JSON.parse(await f.text()) as unknown;
              setEntries(Array.isArray(parsed) ? (parsed as Partial<RecordJSON>[]) : []);
              const m = /(\d{2})([a-z]{3})/i.exec(f.name);
              if (m) {
                const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
                const mi = months.indexOf(m[2].toLowerCase());
                if (mi >= 0) setDate(`${new Date().getFullYear()}-${String(mi + 1).padStart(2, "0")}-${m[1]}`);
              }
            } catch {
              setEntries([]);
              setDone("That file is not a records JSON list.");
            }
          }}
        />
        <label className="field">
          <span>Sheet date</span>
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>
      {entries.length > 0 && (
        <>
          <ul className="plain small">
            {entries.map((e, i) => {
              const m = matchRecord(e, students);
              return (
                <li key={i}>
                  {e.name ?? "(no name)"}
                  {e.slot ? <span className="muted">, {e.slot}</span> : null}:{" "}
                  {m ? (
                    <>
                      <b>{m.student.name}</b>
                      {m.by === "slot" && <span className="muted"> (by slot; the sheet's name is kept as the name on the sheet)</span>}
                    </>
                  ) : (
                    <span className="pill pill-warn">no matching student</span>
                  )}
                </li>
              );
            })}
          </ul>
          <button
            className="btn btn-primary btn-sm"
            type="button"
            onClick={() => {
              let n = 0;
              for (const e of entries) {
                const m = matchRecord(e, students);
                if (!m) continue;
                const s = m.student;
                const patch: Partial<Student> = {};
                if (e.lang === "es" && s.lang !== "es") patch.lang = "es";
                if (e.accent && !s.accent) patch.accent = e.accent;
                if (m.by === "slot" && e.name?.trim() && e.name.trim() !== s.name.trim() && !s.displayName) patch.displayName = e.name.trim();
                if (Object.keys(patch).length) store.update("students", s.id, patch);
                // The block's challenges: an open one with the same code is the same challenge.
                const open = challenges.filter((c) => c.student === s.id && c.state === "open");
                const ids = recordChallenges(e).map((rc) => {
                  const have = open.find((c) => c.code.toLowerCase() === rc.code.toLowerCase());
                  if (have) return have.id;
                  const minutes = /(\d+)\s*(minutes|minutos)/i.exec(rc.name);
                  return store.create("challenges", {
                    student: s.id,
                    name: rc.name,
                    code: rc.code,
                    points: rc.points,
                    state: "open",
                    criterion: "",
                    blocks: 0,
                    minutesGoal: minutes ? Number(minutes[1]) : null,
                    openedOn: date,
                    completedOn: "",
                    inNotebook: false,
                  }).id;
                });
                const edition = Math.max(0, ...weeks.filter((w) => w.student === s.id && w.date === date).map((w) => w.edition)) + 1;
                store.create(
                  "weeks",
                  { student: s.id, date, status: "printed", edition, builtFrom: "lesson", sheet: { ...fromRecord(e), challenges: ids }, ticks: [], notes: [], listening: [], gotIt: {}, seen: "" },
                  weekTitle(s, date),
                );
                n++;
              }
              setDone(`Imported ${n} ${n === 1 ? "sheet" : "sheets"}.`);
              setEntries([]);
            }}
          >
            Import {entries.filter((e) => matchRecord(e, students)).length} sheets
          </button>
        </>
      )}
      {done && <p className="small">{done}</p>}
    </section>
  );
}
