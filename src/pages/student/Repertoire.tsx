import { useMemo, useState } from "react";
import { store, useData } from "../../data/store";
import { isoDate } from "../../../shared/dates";
import { PIECE_STATUSES, ROLES, SOUND, type RepertoireItem, type Song, type Student } from "../../../shared/types";
import { Empty, Icon, Sheet } from "../../components/ui";

const ROLE_LABEL: Record<string, string> = { NOW: "Your song right now", "goal piece": "Goal piece", "keep alive": "Keep alive", recital: "Recital", "played already": "Played already" };

export function Repertoire({ student }: { student: Student }) {
  const items = useData("repertoire").filter((r) => r.student === student.id);
  const [adding, setAdding] = useState(false);
  const byRole = (role: string) => items.filter((r) => r.role === role).sort((a, b) => (b.startedOn || "").localeCompare(a.startedOn || ""));

  return (
    <div className="stack">
      <div className="spread">
        <p className="muted small">Silence does not retire a piece; praise does not mark it mastered. Every move is dated.</p>
        <button className="btn btn-sm btn-primary" type="button" onClick={() => setAdding(true)}>
          <Icon name="plus" size={18} /> Add a piece
        </button>
      </div>
      {items.length === 0 && <Empty>No pieces yet. {student.repertoire ? `Notion's Repertoire says: ${student.repertoire}.` : ""}</Empty>}
      {ROLES.map((role) => {
        const list = byRole(role);
        if (!list.length) return null;
        return (
          <section key={role} className="stack-sm">
            <h3>{ROLE_LABEL[role]}</h3>
            <ul className="stack-sm plain">
              {list.map((r) => (
                <PieceRow key={r.id} r={r} />
              ))}
            </ul>
          </section>
        );
      })}
      <AddPiece student={student} open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}

function PieceRow({ r }: { r: RepertoireItem }) {
  const up = (p: Partial<RepertoireItem>) => store.update("repertoire", r.id, p);
  return (
    <li className="card pad stack-sm">
      <div className="spread">
        <b>{r.title}</b>
        <span className="muted small">
          {r.startedOn ? `since ${r.startedOn}` : ""}
          {r.finishedOn ? `, finished ${r.finishedOn}` : ""}
        </span>
      </div>
      <div className="grid-3">
        <label className="field">
          <span>Role</span>
          <select className="input" value={r.role} onChange={(e) => up({ role: e.target.value, ...(e.target.value === "played already" && !r.finishedOn ? { finishedOn: isoDate() } : {}) })}>
            {ROLES.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Status</span>
          <select className="input" value={r.status} onChange={(e) => up({ status: e.target.value })}>
            {PIECE_STATUSES.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>SOUND stage</span>
          <select className="input" value={r.sound} onChange={(e) => up({ sound: e.target.value })}>
            <option value="">None</option>
            {SOUND.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
      </div>
      {r.scoreLink && (
        <a className="small" href={r.scoreLink} target="_blank" rel="noreferrer">
          Score
        </a>
      )}
    </li>
  );
}

function AddPiece({ student, open, onClose }: { student: Student; open: boolean; onClose: () => void }) {
  const songs = useData("songs");
  const [q, setQ] = useState("");
  const [role, setRole] = useState<string>("NOW");
  const [chosenHow, setChosenHow] = useState("");
  const matches = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (n.length < 2) return [] as Song[];
    return songs.filter((s) => s.title.toLowerCase().includes(n)).slice(0, 12);
  }, [songs, q]);

  const add = (title: string, song?: Song) => {
    store.create(
      "repertoire",
      { student: student.id, title, song: song?.id ?? "", role, status: role === "played already" ? "achieved" : "starting", sound: "", startedOn: isoDate(), finishedOn: role === "played already" ? isoDate() : "", chosenHow, scoreLink: song?.link ?? "" },
      undefined,
    );
    setQ("");
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title="Add a piece">
      <label className="field">
        <span>Title, or search the song bank</span>
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      </label>
      {matches.length > 0 && (
        <ul className="list card">
          {matches.map((s) => (
            <li key={s.id}>
              <button className="list-row" type="button" onClick={() => add(s.title, s)}>
                <span className="grow">{s.title}</span>
                <span className="muted small">{s.level}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="grid-2">
        <label className="field">
          <span>Role</span>
          <select className="input" value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLES.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>How it was chosen</span>
          <input className="input" value={chosenHow} onChange={(e) => setChosenHow(e.target.value)} placeholder="In conversation, from the playlist" />
        </label>
      </div>
      <div className="sheet-actions">
        <button className="btn btn-primary btn-block" type="button" disabled={!q.trim()} onClick={() => add(q.trim())}>
          Add "{q.trim() || "piece"}"
        </button>
      </div>
    </Sheet>
  );
}
