import { useEffect, useState } from "react";
import { store, useDB } from "../data/store";
import { decodePayload, type ScoresPayload } from "../data/share";
import { href } from "../router";
import { Avatar } from "../components/ui";

/** Opened on the teacher's device from a student's "Send scores" link. */
export function ImportScores({ code }: { code: string }) {
  const db = useDB((d) => d);
  const [p, setP] = useState<ScoresPayload | null>(null);
  const [error, setError] = useState(false);
  const [result, setResult] = useState<number | null>(null);

  useEffect(() => {
    decodePayload(code)
      .then((x) => (x.kind === "scores" ? setP(x) : setError(true)))
      .catch(() => setError(true));
  }, [code]);

  if (error) {
    return (
      <div className="card empty stack">
        <h2>That link didn't open</h2>
        <p>It may have been cut off when it was pasted. Ask the student to send it again.</p>
      </div>
    );
  }
  if (!p) return <div className="empty">Opening…</div>;

  const known = db.students.find((s) => s.id === p.student.id);
  const have = new Set(db.sessions.map((s) => s.id));
  const fresh = p.sessions.filter((s) => !have.has(s.id));
  const dates = p.sessions.map((s) => new Date(s.startedAt).getTime());
  const fmt = (t: number) => new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  const add = () => {
    const now = new Date().toISOString();
    const added = store.importData({
      students: known
        ? []
        : [{ ...p.student, createdAt: now, updatedAt: now, levelUp: 1, pointsCarried: 0, playsForPoints: true } as never],
      sessions: p.sessions.map((s) => ({ ...s, studentId: p.student.id, device: s.device ?? "home" })),
    });
    setResult(added.sessions);
  };

  return (
    <div className="card pad stack" style={{ maxWidth: 560, margin: "4vh auto" }}>
      <div className="row">
        <Avatar student={p.student} size={56} />
        <div>
          <h1>{p.student.name}</h1>
          <p className="muted small">
            {p.sessions.length} game{p.sessions.length === 1 ? "" : "s"}
            {dates.length ? `, ${fmt(Math.min(...dates))}${dates.length > 1 ? ` – ${fmt(Math.max(...dates))}` : ""}` : ""}
          </p>
        </div>
      </div>
      {result !== null ? (
        <>
          <p className="pill pill-good" style={{ alignSelf: "flex-start" }}>
            Added {result} game{result === 1 ? "" : "s"}.
          </p>
          <a className="btn btn-primary" href={href(`/teacher/${p.student.id}`)}>
            See {p.student.name.split(" ")[0]}'s progress
          </a>
        </>
      ) : (
        <>
          {!known && <p className="banner">{p.student.name} isn't on this device yet. Adding the scores adds them as a student at Level Up 1; adjust that after.</p>}
          <p>{fresh.length ? `${fresh.length} of these are new here.` : "You already have all of these games."}</p>
          <button className="btn btn-primary" type="button" onClick={add} disabled={!fresh.length}>
            Add to my records
          </button>
        </>
      )}
    </div>
  );
}
