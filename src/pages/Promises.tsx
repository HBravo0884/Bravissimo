import { useState } from "react";
import { store, useData } from "../data/store";
import { activeStudents, nameOf, studentById } from "../data/select";
import { addPromise, keepPromise } from "../data/actions";
import { PROMISE_KINDS, PROMISE_STATES, type PromiseItem } from "../../shared/types";
import { Empty, Icon, Segmented, Sheet } from "../components/ui";

/** Something said in the room that Hector will prepare. It stays on Today until it is kept. */
export function Promises() {
  const promises = useData("promises");
  const students = useData("students");
  const [show, setShow] = useState<"owed" | "kept">("owed");
  const [adding, setAdding] = useState(false);
  const list = promises
    .filter((p) => (show === "owed" ? p.state !== "kept" : p.state === "kept"))
    .sort((a, b) => (a.saidOn || "").localeCompare(b.saidOn || ""));

  return (
    <div className="stack">
      <header className="page-head spread">
        <div>
          <span className="eyebrow">Promises</span>
          <h1>{promises.filter((p) => p.state !== "kept").length} owed</h1>
          <p className="muted">The sheet never promises anything on your behalf; these are for you.</p>
        </div>
        <button className="btn btn-sm btn-primary" type="button" onClick={() => setAdding(true)}>
          <Icon name="plus" size={18} /> A promise
        </button>
      </header>
      <Segmented
        label="Which promises"
        value={show}
        options={[
          { id: "owed", label: "Owed" },
          { id: "kept", label: "Kept" },
        ]}
        onChange={setShow}
      />
      {list.length === 0 ? (
        <Empty>{show === "owed" ? "Nothing owed." : "Nothing kept yet."}</Empty>
      ) : (
        <ul className="stack-sm plain">
          {list.map((p) => (
            <PromiseRow key={p.id} p={p} who={nameOf(studentById({ students }, p.student))} />
          ))}
        </ul>
      )}
      <AddPromise open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}

function PromiseRow({ p, who }: { p: PromiseItem; who: string }) {
  return (
    <li className="card pad stack-sm">
      <div className="spread">
        <div>
          <b>{p.what}</b>
          <div className="small muted">
            To {who} · {p.kind} · said {p.saidOn}
            {p.recordingTime ? ` at ${p.recordingTime}` : ""}
            {p.keptOn ? ` · kept ${p.keptOn}` : ""}
          </div>
        </div>
        <select className="input input-kind" value={p.state} onChange={(e) => (e.target.value === "kept" ? keepPromise(p) : store.update("promises", p.id, { state: e.target.value }))} aria-label="State">
          {PROMISE_STATES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
      {p.state !== "kept" && (
        <div className="row-wrap">
          <input className="input grow" type="url" placeholder="Where it is now (a link), optional" defaultValue={p.where} onBlur={(e) => e.target.value !== p.where && store.update("promises", p.id, { where: e.target.value.trim() })} aria-label="Where it is" />
          <button className="btn btn-sm btn-primary" type="button" onClick={() => keepPromise(p)}>
            <Icon name="check" size={18} /> Kept
          </button>
        </div>
      )}
    </li>
  );
}

function AddPromise({ open, onClose }: { open: boolean; onClose: () => void }) {
  const students = activeStudents({ students: useData("students") });
  const [student, setStudent] = useState("");
  const [what, setWhat] = useState("");
  const [kind, setKind] = useState("other");
  return (
    <Sheet open={open} onClose={onClose} title="A promise">
      <label className="field">
        <span>To</span>
        <select className="input" value={student} onChange={(e) => setStudent(e.target.value)}>
          <option value="">Choose a student</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {nameOf(s)}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>What</span>
        <input className="input" value={what} onChange={(e) => setWhat(e.target.value)} />
      </label>
      <label className="field">
        <span>Kind</span>
        <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
          {PROMISE_KINDS.map((k) => (
            <option key={k}>{k}</option>
          ))}
        </select>
      </label>
      <div className="sheet-actions">
        <button
          className="btn btn-primary btn-block"
          type="button"
          disabled={!student || !what.trim()}
          onClick={() => {
            addPromise(student, what.trim(), kind);
            setWhat("");
            onClose();
          }}
        >
          Save
        </button>
      </div>
    </Sheet>
  );
}
