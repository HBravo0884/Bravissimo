import { useEffect, useState } from "react";
import { store } from "../data/store";
import { decodePayload, type JoinPayload } from "../data/share";
import { navigate } from "../router";
import { Avatar } from "../components/ui";

/** Opened from the teacher's home practice link, on the student's own device. */
export function Join({ code }: { code: string }) {
  const [p, setP] = useState<JoinPayload | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    decodePayload(code)
      .then((x) => (x.kind === "join" ? setP(x) : setError(true)))
      .catch(() => setError(true));
  }, [code]);

  if (error) {
    return (
      <div className="card empty stack">
        <h2>That link didn't work</h2>
        <p>Ask your teacher to send the home practice link again.</p>
      </div>
    );
  }
  if (!p) return <div className="empty">Opening…</div>;

  const first = p.student.name.split(" ")[0];
  const setUp = () => {
    const existing = store.get().students.find((s) => s.id === p.student.id);
    const now = new Date().toISOString();
    store.importData({
      students: [
        {
          ...(existing ?? { createdAt: now, pointsCarried: 0 }),
          ...p.student,
          updatedAt: now,
        } as never,
      ],
      challenges: p.challenges,
    });
    store.updateSettings({ homeStudentId: p.student.id, studioName: p.studio, teacherName: p.teacher });
    navigate(`/s/${p.student.id}`, true);
  };

  return (
    <div className="card pad stack" style={{ maxWidth: 520, margin: "6vh auto", alignItems: "center", textAlign: "center" }}>
      <Avatar student={p.student} size={72} />
      <h1>Hi {first}!</h1>
      <p className="muted">
        This sets up this device for your practice with {p.teacher} at {p.studio}. Your games stay on this device until you send them.
      </p>
      <button className="btn btn-primary btn-block" type="button" onClick={setUp}>
        Start practicing
      </button>
    </div>
  );
}
