import { useEffect, useMemo } from "react";
import { store, useDB } from "../data/store";
import { practiceStreak, sessionsOf } from "../data/stats";
import { buildDemoStudio } from "../data/demo";
import { href, navigate } from "../router";
import { Avatar, Icon } from "../components/ui";

export function Home() {
  const db = useDB((d) => d);
  const homeId = db.settings.homeStudentId;

  useEffect(() => {
    if (homeId && db.students.some((s) => s.id === homeId)) navigate(`/s/${homeId}`, true);
  }, [homeId, db.students]);

  const students = useMemo(() => db.students.filter((s) => !s.archived).sort((a, b) => a.name.localeCompare(b.name)), [db.students]);
  const streaks = useMemo(() => Object.fromEntries(students.map((s) => [s.id, practiceStreak(sessionsOf(db.sessions, s.id))])), [students, db.sessions]);

  return (
    <div className="stack">
      <div className="hero">
        <span className="eyebrow">{db.settings.studioName}</span>
        <h1>Who's practicing today?</h1>
        <p className="muted">Tap your name to play. Your scores go to {db.settings.teacherName}.</p>
      </div>

      {students.length > 0 ? (
        <div className="who-grid">
          {students.map((s) => {
            const st = streaks[s.id];
            return (
              <a key={s.id} className="who" href={href(`/s/${s.id}`)}>
                <Avatar student={s} size={60} />
                <span>{s.name.split(" ")[0]}</span>
                <span className="streak">{st.current > 0 ? `🔥 ${st.current} day${st.current > 1 ? "s" : ""}` : " "}</span>
              </a>
            );
          })}
          <a className="who" href={href("/s/guest")}>
            <span className="avatar" style={{ width: 60, height: 60, background: "var(--sunk)", color: "var(--ink-2)" }}>
              <Icon name="play" />
            </span>
            <span>Just play</span>
            <span className="streak">Scores not saved</span>
          </a>
        </div>
      ) : (
        <div className="card empty stack" style={{ alignItems: "center" }}>
          <h2>No students yet</h2>
          <p>Add your students in the teacher area, or look around with a made-up studio first.</p>
          <div className="btn-row" style={{ justifyContent: "center" }}>
            <a className="btn btn-primary" href={href("/teacher")}>
              <Icon name="plus" size={18} /> Add students
            </a>
            <button className="btn" type="button" onClick={() => store.replaceAll(buildDemoStudio())}>
              Try the demo studio
            </button>
            <a className="btn btn-ghost" href={href("/s/guest")}>
              Just play
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
