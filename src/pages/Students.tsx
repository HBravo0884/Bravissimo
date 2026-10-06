import { useMemo, useState } from "react";
import { store, useData, useSync } from "../data/store";
import { nameOf, weeksFor } from "../data/select";
import { slotLabel } from "../../shared/records";
import { href, navigate } from "../router";
import { Chip, Empty, Icon, Segmented } from "../components/ui";
import type { Student } from "../../shared/types";

const ACCENTS = ["#097C87", "#065E68", "#1C7294", "#1B6D5E", "#317F73", "#D22B27", "#9B1414", "#084365"];

export function Students() {
  const students = useData("students");
  const weeks = useData("weeks");
  const sync = useSync();
  const [q, setQ] = useState("");
  const [show, setShow] = useState<"active" | "all">("active");

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return students
      .filter((s) => (show === "all" ? true : s.status !== "Discontinued"))
      .filter((s) => !needle || `${s.name} ${s.displayName} ${s.slots.join(" ")}`.toLowerCase().includes(needle))
      .sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
  }, [students, q, show]);

  const add = () => {
    const name = window.prompt("Full name, as Opus1 has it");
    if (!name?.trim()) return;
    const s = store.create("students", {
      name: name.trim(),
      displayName: "",
      status: "Active",
      slots: [],
      times: [],
      location: "",
      sessions: ["30"],
      age: null,
      ageBand: "",
      levelUp: "",
      playlist: "",
      goalPiece: "",
      repertoire: "",
      fern: "",
      prescription: [],
      sprint: "",
      creative: "",
      experience: [],
      folder: "",
      lang: "en",
      familyLang: "en",
      accent: ACCENTS[students.length % ACCENTS.length],
      pointsMode: "plays for points",
      flags: [],
      paBook: "",
      span15: null,
      span14: null,
      spanOn: "",
      adultName: "",
      familyKey: "",
      familyKeyOn: "",
    } satisfies Omit<Student, "id">);
    navigate(`/s/${s.id}/profile`);
  };

  return (
    <div className="stack">
      <header className="page-head spread">
        <div>
          <span className="eyebrow">Students</span>
          <h1>{list.length} students</h1>
        </div>
        <button className="btn btn-sm" type="button" onClick={add}>
          <Icon name="plus" size={18} /> Add a student
        </button>
      </header>
      <div className="row-wrap">
        <input className="input grow" type="search" placeholder="Find a student or a slot" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a student" />
        <Segmented
          label="Which students"
          value={show}
          options={[
            { id: "active", label: "Current" },
            { id: "all", label: "Everyone" },
          ]}
          onChange={setShow}
        />
      </div>
      {list.length === 0 ? (
        <Empty>{sync.mode === "notion" && sync.status === "syncing" ? "Loading the Student tracker." : "No students match."}</Empty>
      ) : (
        <ul className="list card">
          {list.map((s) => {
            const w = weeksFor({ weeks }, s.id)[0];
            return (
              <li key={s.id}>
                <a className="list-row" href={href(`/s/${s.id}`)}>
                  <Chip name={nameOf(s)} accent={s.accent} />
                  <div className="grow">
                    <div className="row-wrap">
                      <b>{nameOf(s)}</b>
                      {s.status !== "Active" && <span className="pill">{s.status || "No status"}</span>}
                      {s.pointsMode !== "plays for points" && <span className="pill">No points</span>}
                      {s.lang === "es" && <span className="pill">ES</span>}
                    </div>
                    <div className="muted small">
                      {[slotLabel(s), w?.sheet.song || s.repertoire].filter(Boolean).join(" · ") || "No slot yet"}
                    </div>
                  </div>
                  <Icon name="next" size={18} />
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
