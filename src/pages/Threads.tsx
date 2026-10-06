import { useState } from "react";
import { store, useData } from "../data/store";
import { activeStudents, nameOf, studentById } from "../data/select";
import { addDays, isoDate } from "../../shared/dates";
import { THREAD_KINDS, THREAD_STATUSES, type Thread } from "../../shared/types";
import { Empty, Icon, Segmented, Sheet, TextField } from "../components/ui";

const ORDER = ["Needs a decision", "Open", "Advancing", "Resolved", "Dropped"];

/** Storylines across weeks: opened when noticed, touched when worked, closed only when settled. */
export function Threads() {
  const threads = useData("threads");
  const students = useData("students");
  const [show, setShow] = useState<"open" | "closed">("open");
  const [adding, setAdding] = useState(false);
  const stale = addDays(isoDate(), -21);
  const list = threads
    .filter((t) => (show === "open" ? !["Resolved", "Dropped"].includes(t.status) : ["Resolved", "Dropped"].includes(t.status)))
    .sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || (a.lastTouched || "").localeCompare(b.lastTouched || ""));

  return (
    <div className="stack">
      <header className="page-head spread">
        <div>
          <span className="eyebrow">Threads</span>
          <h1>{threads.filter((t) => !["Resolved", "Dropped"].includes(t.status)).length} open</h1>
          <p className="muted">What we are watching names an observable; Next move is one thing to try. Blank means it needs thinking about before the next lesson.</p>
        </div>
        <button className="btn btn-sm btn-primary" type="button" onClick={() => setAdding(true)}>
          <Icon name="plus" size={18} /> Open a thread
        </button>
      </header>
      <Segmented
        label="Which threads"
        value={show}
        options={[
          { id: "open", label: "Open" },
          { id: "closed", label: "Closed" },
        ]}
        onChange={setShow}
      />
      {list.length === 0 ? (
        <Empty>No threads here.</Empty>
      ) : (
        <ul className="stack-sm plain">
          {list.map((t) => (
            <ThreadRow key={t.id} t={t} who={t.student ? nameOf(studentById({ students }, t.student)) : "Studio"} stale={!!t.lastTouched && t.lastTouched < stale && !["Resolved", "Dropped"].includes(t.status)} />
          ))}
        </ul>
      )}
      <AddThread open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}

function ThreadRow({ t, who, stale }: { t: Thread; who: string; stale: boolean }) {
  const up = (p: Partial<Thread>) => store.update("threads", t.id, p);
  return (
    <li className="card pad stack-sm">
      <div className="spread">
        <div>
          <b>{t.name}</b>
          <div className="small muted">
            {who} · {t.kind || "No kind"} · opened {t.opened || "undated"} · last touched {t.lastTouched || "never"}
          </div>
        </div>
        <div className="row-wrap">
          {stale && <span className="pill pill-warn">Untouched three weeks</span>}
          <select className="input input-kind" value={t.status} onChange={(e) => up({ status: e.target.value })} aria-label="Status">
            {THREAD_STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid-2">
        <TextField label="What we are watching" value={t.watching} onSave={(v) => up({ watching: v })} />
        <TextField label="Next move" value={t.nextMove} onSave={(v) => up({ nextMove: v })} />
      </div>
      <button className="btn btn-sm btn-ghost" type="button" onClick={() => up({ lastTouched: isoDate(), status: t.status === "Open" ? "Advancing" : t.status })}>
        It moved today
      </button>
    </li>
  );
}

function AddThread({ open, onClose }: { open: boolean; onClose: () => void }) {
  const students = activeStudents({ students: useData("students") });
  const [student, setStudent] = useState("");
  const [name, setName] = useState("");
  const [kind, setKind] = useState<string>("Technique");
  const [watching, setWatching] = useState("");
  return (
    <Sheet open={open} onClose={onClose} title="Open a thread">
      <label className="field">
        <span>Whose</span>
        <select className="input" value={student} onChange={(e) => setStudent(e.target.value)}>
          <option value="">The studio</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {nameOf(s)}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Storyline</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="the left hand stops at bar 3" />
      </label>
      <label className="field">
        <span>Kind</span>
        <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
          {THREAD_KINDS.map((k) => (
            <option key={k}>{k}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>What we are watching</span>
        <input className="input" value={watching} onChange={(e) => setWatching(e.target.value)} placeholder="Name the observable, not the aspiration" />
      </label>
      <div className="sheet-actions">
        <button
          className="btn btn-primary btn-block"
          type="button"
          disabled={!name.trim()}
          onClick={() => {
            const s = students.find((x) => x.id === student);
            store.create("threads", {
              name: `${s ? nameOf(s).split(" ")[0] : "Studio"} - ${name.trim()}`,
              kind,
              status: "Open",
              student,
              watching,
              nextMove: "",
              opened: isoDate(),
              lastTouched: isoDate(),
              lessons: [],
            });
            setName("");
            setWatching("");
            onClose();
          }}
        >
          Open it
        </button>
      </div>
    </Sheet>
  );
}
