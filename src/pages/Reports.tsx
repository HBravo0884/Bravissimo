import { useMemo, useState } from "react";
import { store, useData } from "../data/store";
import { lessonsFor, nameOf, studentById, weeksFor } from "../data/select";
import { reportsDue } from "../../shared/board";
import { voiceProblems } from "../../shared/records";
import { addDays, isoDate, longDate, monthName } from "../../shared/dates";
import { REPORT_KINDS, type Lesson, type Report, type Student, type Week } from "../../shared/types";
import { CopyButton, Empty, Icon, Segmented } from "../components/ui";

/**
 * Who is due, drafts built from lesson records only, the voice check, a copy
 * for Opus1, and a posted tick that only Hector sets after he posts.
 */
export function Reports() {
  const students = useData("students");
  const reports = useData("reports");
  const lessons = useData("lessons");
  const today = isoDate();
  const [show, setShow] = useState<"due" | "drafts" | "posted">("due");
  const [open, setOpen] = useState<string>("");
  const due = useMemo(() => reportsDue({ students, reports, lessons }, today), [students, reports, lessons, today]);
  const drafts = reports.filter((r) => r.state !== "posted").sort((a, b) => (b.draftedOn || "").localeCompare(a.draftedOn || ""));
  const posted = reports.filter((r) => r.state === "posted").sort((a, b) => (b.postedOn || "").localeCompare(a.postedOn || ""));
  const thisWeek = posted.filter((r) => r.postedOn >= addDays(today, -6)).length;

  return (
    <div className="stack">
      <header className="page-head">
        <span className="eyebrow">Reports</span>
        <h1>
          {thisWeek} of 3 posted this week
        </h1>
        <p className="muted">Every student once a quarter, the first full report after lesson 3, minis after a notable lesson. Writing is not the bottleneck; reaching the family is.</p>
      </header>
      <Segmented
        label="Reports"
        value={show}
        options={[
          { id: "due", label: `Due (${due.length})` },
          { id: "drafts", label: `Drafts (${drafts.length})` },
          { id: "posted", label: "Posted" },
        ]}
        onChange={setShow}
      />

      {show === "due" &&
        (due.length === 0 ? (
          <Empty>Nobody is due. Every active student has a report in the last three months or a draft waiting.</Empty>
        ) : (
          <ul className="list card">
            {due.map((d) => {
              const recent = lessonsFor({ lessons }, d.student.id).filter((l) => l.whatChanged || l.evidence);
              return (
                <li key={d.student.id} className="list-row static">
                  <div className="grow">
                    <b>{nameOf(d.student)}</b>
                    <div className="small muted">
                      {d.why}. {recent.length ? `${recent.length} ${recent.length === 1 ? "lesson record" : "lesson records"} to draft from.` : "No lesson record yet: a report needs a recording, a transcript or your notes."}
                    </div>
                  </div>
                  <button
                    className="btn btn-sm"
                    type="button"
                    disabled={!recent.length}
                    onClick={() => {
                      const r = startDraft(d.student, recent.slice(0, 4), "full");
                      setOpen(r.id);
                      setShow("drafts");
                    }}
                  >
                    Start a draft
                  </button>
                </li>
              );
            })}
          </ul>
        ))}

      {show === "drafts" &&
        (drafts.length === 0 ? (
          <Empty>No drafts. Claude's drafts from the studio run land here too.</Empty>
        ) : (
          <div className="stack-sm">
            {drafts.map((r) => (
              <ReportEditor key={r.id} report={r} open={open === r.id} onToggle={() => setOpen(open === r.id ? "" : r.id)} student={studentById({ students }, r.student)} />
            ))}
          </div>
        ))}

      {show === "posted" &&
        (posted.length === 0 ? (
          <Empty>Nothing posted yet.</Empty>
        ) : (
          <ul className="list card">
            {posted.map((r) => (
              <li key={r.id} className="list-row static">
                <span className="grow">
                  <b>{nameOf(studentById({ students }, r.student))}</b> <span className="muted small">{r.kind}</span>
                </span>
                <span className="muted small">posted {r.postedOn}</span>
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}

const HEADINGS = {
  en: { moment: "The moment I keep thinking about:", grown: "How you've grown:", where: "Where we are:", goal: "Your goal piece:", mission: "This month's mission:", forAdult: (n: string) => `For ${n || "[name]"}:`, next: "Next up:", focus: (f: string) => `Our one focus right now is ${f ? f.toLowerCase() : "[focus]"}.`, hatch: "If a day feels heavy, do just the warm-up. Showing up is the skill." },
  es: { moment: "El momento en que sigo pensando:", grown: "Cómo has crecido:", where: "Dónde estamos:", goal: "Tu pieza meta:", mission: "La misión de este mes:", forAdult: (n: string) => `Para ${n || "[nombre]"}:`, next: "Lo que sigue:", focus: (f: string) => `Nuestro único enfoque ahora es ${f ? f.toLowerCase() : "[enfoque]"}.`, hatch: "Si un día se siente pesado, haz solo el calentamiento. Presentarse es la habilidad." },
};

/** A skeleton with the seven parts, the facts from the lesson records in brackets to rewrite. Nothing is invented. */
export function reportSkeleton(student: Student, kind: string, lessons: Lesson[], week: Week | undefined): string {
  const lang = student.familyLang;
  const H = HEADINGS[lang];
  const facts = lessons.map((l) => `[${l.date}: ${[l.whatChanged, l.evidence].filter(Boolean).join(" Evidence: ")}]`).join("\n");
  const routine = week?.sheet.routine.map((r) => `${r.min} min ${r.text}`).join(", ") ?? "";
  if (kind === "mini") {
    return lang === "es"
      ? `Una nota rápida de hoy: [un logro, una línea]. Estamos trabajando en ${student.fern || "[enfoque]"}; los 10 minutos de esta semana: [prescripción]. Lo que sigue: [meta].\n\n${facts}`
      : `Quick note from today: [win, one line]. We're working on ${student.fern?.toLowerCase() || "[focus]"}; this week's 10 minutes: [prescription]. Next up: [milestone].\n\n${facts}`;
  }
  const parts = [
    `${H.moment}\n${facts || "[a moment from the recording or your notes]"}`,
    `${H.grown}\n[In ${monthName(lessons[lessons.length - 1]?.date ?? isoDate(), lang)}, what was true. Now, what is true.]`,
    `${H.where}\n${H.focus(student.fern)}${week?.sheet.song ? ` ${week.sheet.song}.` : ""}`,
    `${H.goal}\n${student.goalPiece || "[goal piece]"}`,
    `${H.mission}\n${routine ? `[${routine}]` : "[exact minutes and bars]"} ${H.hatch}`,
    ...(kind === "adult" || student.ageBand === "adult" ? [] : [`${H.forAdult(student.adultName)}\n[one verb]${student.playlist ? ` ${student.playlist}` : ""}`]),
    `${H.next}\n[the next milestone]`,
  ];
  return parts.join("\n\n");
}

function startDraft(student: Student, lessons: Lesson[], kind: string): Report {
  const week = weeksFor(store.data(), student.id)[0];
  return store.create(
    "reports",
    {
      student: student.id,
      name: `${nameOf(student)}, ${kind} report`,
      kind: student.ageBand === "adult" && kind === "full" ? "adult" : kind,
      lang: student.familyLang,
      state: "drafted",
      lessons: lessons.map((l) => l.id),
      draftedOn: isoDate(),
      postedOn: "",
      body: reportSkeleton(student, kind, lessons, week),
      fern: student.fern,
      parentVerb: "",
    },
    undefined,
  );
}

const MANUAL_CHECKS = [
  "Spoken to the student as you, with the parent overhearing",
  "Joy before logistics",
  "One moment only you could write",
  "Every compliment tied to evidence",
  "One FERN focus, one parent verb, one goal piece, no more",
  "Numbers that motivate, never grades",
  "The escape hatch is there",
  "Every sentence is one you would say out loud in the room",
  "No hardship restated, no other student",
];

function ReportEditor({ report, student, open, onToggle }: { report: Report; student?: Student; open: boolean; onToggle: () => void }) {
  const lessons = useData("lessons").filter((l) => report.lessons.includes(l.id));
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [body, setBody] = useState(report.body);
  const problems = voiceProblems(body.replace(/\[[^\]]*\]/g, ""), "The report");
  const words = body.replace(/\[[^\]]*\]/g, "").split(/\s+/).filter(Boolean).length;
  const brackets = (body.match(/\[[^\]]*\]/g) ?? []).length;
  const ready = !problems.some((p) => p.level === "error") && brackets === 0 && checked.size === MANUAL_CHECKS.length;
  const up = (p: Partial<Report>) => store.update("reports", report.id, p);

  return (
    <section className="card pad stack-sm">
      <button className="spread unbutton" type="button" onClick={onToggle} aria-expanded={open}>
        <span>
          <b>{student ? nameOf(student) : "A student"}</b> <span className="muted small">{report.kind} · {report.state} · drafted {report.draftedOn}</span>
        </span>
        <Icon name={open ? "up" : "down"} size={18} />
      </button>
      {open && (
        <>
          {lessons.length > 0 ? (
            <p className="small muted">Built from {lessons.map((l) => longDate(l.date)).join(", ")}.</p>
          ) : (
            <p className="banner">No lesson record behind this draft. A report exists only when a recording, a transcript or your notes exist.</p>
          )}
          <div className="row-wrap">
            <select className="input input-kind" value={report.kind} onChange={(e) => up({ kind: e.target.value })} aria-label="Kind">
              {REPORT_KINDS.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
            <select className="input input-kind" value={report.lang} onChange={(e) => up({ lang: e.target.value as Report["lang"] })} aria-label="Language">
              <option value="en">English</option>
              <option value="es">Spanish</option>
            </select>
            {student && (
              <button className="btn btn-sm btn-ghost" type="button" onClick={() => window.confirm("Replace the text with a fresh skeleton?") && setBody(reportSkeleton(student, report.kind, lessons, weeksFor(store.data(), student.id)[0]))}>
                Fresh skeleton
              </button>
            )}
          </div>
          <textarea className="input report-body" rows={16} value={body} onChange={(e) => setBody(e.target.value)} onBlur={() => body !== report.body && up({ body })} aria-label="Report text" />
          <p className={`small ${words > 360 ? "bad-text" : "muted"}`}>
            {words} words; about 300 is one screen. {brackets ? `${brackets} bracketed notes still to rewrite.` : ""}
          </p>
          {problems.length > 0 && (
            <ul className="problems">
              {problems.map((p, i) => (
                <li key={i} className={p.level}>
                  {p.text}
                </li>
              ))}
            </ul>
          )}
          <fieldset className="checklist">
            <legend>Voice check</legend>
            {MANUAL_CHECKS.map((c, i) => (
              <label key={i} className="check">
                <input type="checkbox" checked={checked.has(i)} onChange={(e) => setChecked((s) => (e.target.checked ? new Set(s).add(i) : new Set([...s].filter((x) => x !== i))))} />
                {c}
              </label>
            ))}
          </fieldset>
          <div className="btn-row">
            <CopyButton text={body.replace(/\[[^\]]*\]\n?/g, "").trim()} label="Copy for Opus1" />
            <button className="btn btn-sm btn-ghost" type="button" onClick={() => up({ state: report.state === "on hold" ? "drafted" : "on hold" })}>
              {report.state === "on hold" ? "Take off hold" : "On hold"}
            </button>
            <button
              className="btn btn-primary"
              type="button"
              disabled={!ready}
              title={ready ? undefined : "Rewrite the bracketed notes and tick the voice check first"}
              onClick={() => {
                if (!window.confirm("Mark it posted? Only do this after you posted it in Opus1.")) return;
                up({ body, state: "posted", postedOn: isoDate() });
                for (const l of lessons) store.update("lessons", l.id, { status: "Report posted" });
              }}
            >
              <Icon name="check" size={18} /> I posted it
            </button>
          </div>
        </>
      )}
    </section>
  );
}
