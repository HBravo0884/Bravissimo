import { useState } from "react";
import { labels } from "../../shared/labels";
import { longDate } from "../../shared/dates";
import type { FamilyView, Lang, ListeningEntry } from "../../shared/types";
import { DayBoxes, Icon } from "./ui";

export interface FamilyActions {
  tick(card: string, day: number, on: boolean): void;
  gotIt(card: string, on: boolean): void;
  write(text: string): Promise<boolean>;
  listen(entry: Omit<ListeningEntry, "on">): Promise<boolean>;
}

/**
 * This week's sheet on a phone, in the family's language: the cards, the day
 * boxes, the routine and the minimum day, Keep it alive, the codes, the note to
 * the adult, and the two ways back: Write to me and the listening log.
 */
export function FamilyWeek({ view, actions, pending, gamesHref }: { view: FamilyView; actions?: FamilyActions; pending?: boolean; gamesHref?: string }) {
  const [lang, setLang] = useState<Lang>(view.lang);
  const L = labels(lang);
  const accent = view.accent || "var(--c1)";
  const ticks = new Map<string, Set<number>>();
  for (const t of view.ticks) {
    if (!ticks.has(t.card)) ticks.set(t.card, new Set());
    ticks.get(t.card)!.add(t.day);
  }
  const days = new Set(view.ticks.map((t) => t.day)).size;

  return (
    <article className="family" lang={lang} style={{ ["--accent-student" as string]: accent }}>
      <header className="family-head">
        <div>
          <h1>{view.displayName}</h1>
          {view.date && <p className="muted">{longDate(view.date, view.lang)}</p>}
        </div>
        <button className="btn btn-sm btn-ghost" type="button" onClick={() => setLang(lang === "en" ? "es" : "en")} aria-label={lang === "en" ? "Ver en español" : "See it in English"}>
          {L.language}
        </button>
      </header>

      {view.empty ? (
        <p className="card pad">{L.notReady}</p>
      ) : (
        <>
          {view.wins.length > 0 && (
            <section className="family-block wins">
              <h2>{L.wins}</h2>
              <ul className="plain">
                {view.wins.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </section>
          )}

          <section className="family-block song">
            <h2>{L.song}</h2>
            <p className="song-title">{view.song}</p>
            {view.songNote && <p>{view.songNote}</p>}
            {view.last && <p className="last">{view.last}</p>}
          </section>

          <section className="stack-sm">
            <p className="small muted">{L.tickHelp}</p>
            {view.cards.map((c) => (
              <div key={c.id} className="family-card">
                <div className="row-wrap">
                  {c.code && (
                    <span className="code-chip" style={{ background: accent }}>
                      {c.code}
                    </span>
                  )}
                  <h3>{c.t}</h3>
                  {c.youPick && <span className="pill">{L.youPick}</span>}
                </div>
                {c.d && <p className="pre-line">{c.d}</p>}
                {c.done && (
                  <p>
                    <b>{L.doneWhen}</b> {c.done}
                  </p>
                )}
                {(c.still || c.carried) && (
                  <p className="small">
                    {c.still ? (
                      <>
                        <b>{L.stillTrue}</b> {c.still.replace(/^still true when\s*/i, "")}
                      </>
                    ) : (
                      <span className="muted">{c.carried}</span>
                    )}
                  </p>
                )}
                {c.book && (
                  <p className="small">
                    <b>{L.fromShelf}</b> {c.book}
                  </p>
                )}
                <DayBoxes label={c.t} accent={accent} ticked={ticks.get(c.id) ?? new Set()} onToggle={actions ? (day, on) => actions.tick(c.id, day, on) : undefined} />
                {actions &&
                  (c.gotIt ? (
                    <p className="small good-text">
                      <Icon name="check" size={16} /> {L.gotItNoted}
                    </p>
                  ) : (
                    <button className="btn btn-sm btn-ghost gotit" type="button" onClick={() => actions.gotIt(c.id, true)}>
                      {L.gotIt}
                    </button>
                  ))}
              </div>
            ))}
            <p className="small">
              <b>{L.practiceDays(days)}</b>
            </p>
          </section>

          {view.routine.length > 0 && (
            <section className="family-block">
              <h2>{L.routine}</h2>
              <ul className="routine-list">
                {view.routine.map((r, i) => (
                  <li key={i}>
                    <span className="min">{r.min} min</span> {r.text}
                  </li>
                ))}
              </ul>
              <p className="minimum">{L.minimumDay}</p>
            </section>
          )}

          {view.keep.t && (
            <section className="family-block">
              <h2>{L.keep}</h2>
              <p>
                <b>{view.keep.t}</b> {view.keep.d}
              </p>
            </section>
          )}

          {view.challenges.length > 0 && (
            <section className="family-block">
              <h2>{L.challenges}</h2>
              <ul className="plain stack-sm">
                {view.challenges.map((c, i) => (
                  <li key={i}>
                    <div className="spread">
                      <span>{c.name}</span>
                      <span className="code">{c.code}</span>
                    </div>
                    <div className="blocks" role="img" aria-label={`${c.blocks} of 10`}>
                      {Array.from({ length: 10 }, (_, k) => (
                        <span key={k} className={k < c.blocks ? "on" : ""} style={k < c.blocks ? { background: accent } : undefined} />
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
              <p className="small muted">{L.challengesNote}</p>
            </section>
          )}

          {view.codes.length > 0 && (
            <section className="family-block">
              <h2>{L.codes}</h2>
              <div className="btn-row">
                {view.codes.map((c, i) => (
                  <a key={i} className="btn" href={c.url} target="_blank" rel="noreferrer">
                    {c.label}
                  </a>
                ))}
                {gamesHref && (
                  <a className="btn" href={gamesHref}>
                    {L.games}
                  </a>
                )}
              </div>
            </section>
          )}
          {!view.codes.length && gamesHref && (
            <a className="btn" href={gamesHref}>
              {L.games}
            </a>
          )}

          <Listening view={view} L={L} actions={actions} />
          <WriteToMe view={view} L={L} actions={actions} pending={pending} />

          {view.adultNote && (
            <section className="family-block adult">
              <h2>{view.adultNote.t || L.adultNote}</h2>
              {(Array.isArray(view.adultNote.d) ? view.adultNote.d : [view.adultNote.d]).map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </section>
          )}
        </>
      )}

      {view.rungs.length > 0 && (
        <section className="family-block">
          <h2>{L.sheets}</h2>
          {view.rungs.map((r, i) => (
            <div key={i} className="rung-family">
              {r.before && (
                <p className="small muted">
                  {L.before}: {r.before}
                </p>
              )}
              <p>
                <b>
                  {L.now}: {r.title}
                </b>
              </p>
              {r.doneWhen && <p className="small">{r.doneWhen}</p>}
              {r.next && (
                <p className="small muted">
                  {L.next}: {r.next}
                </p>
              )}
            </div>
          ))}
        </section>
      )}

      <footer className="family-foot">{L.preparedBy}</footer>
    </article>
  );
}

function Listening({ view, L, actions }: { view: FamilyView; L: ReturnType<typeof labels>; actions?: FamilyActions }) {
  const [e, setE] = useState({ artist: "", track: "", noticed: "", steal: "" });
  const [saved, setSaved] = useState("");
  return (
    <section className="family-block">
      <h2>{L.listening}</h2>
      <p className="small muted">{L.listeningSub}</p>
      {view.listening.map((l, i) => (
        <p key={i} className="small">
          <b>
            {l.artist} {l.track}
          </b>
          {l.noticed && ` · ${L.noticed}: ${l.noticed}`}
          {l.steal && ` · ${L.steal}: ${l.steal}`}
        </p>
      ))}
      {actions && (
        <form
          className="stack-sm"
          onSubmit={async (ev) => {
            ev.preventDefault();
            const ok = await actions.listen(e);
            setSaved(ok ? L.saved : L.notSaved);
            if (ok) setE({ artist: "", track: "", noticed: "", steal: "" });
          }}
        >
          <div className="grid-2">
            <input className="input" placeholder={L.artist} value={e.artist} onChange={(x) => setE({ ...e, artist: x.target.value })} aria-label={L.artist} />
            <input className="input" placeholder={L.track} value={e.track} onChange={(x) => setE({ ...e, track: x.target.value })} aria-label={L.track} />
          </div>
          <input className="input" placeholder={L.noticed} value={e.noticed} onChange={(x) => setE({ ...e, noticed: x.target.value })} aria-label={L.noticed} />
          <input className="input" placeholder={L.steal} value={e.steal} onChange={(x) => setE({ ...e, steal: x.target.value })} aria-label={L.steal} />
          <div className="row">
            <button className="btn btn-sm" type="submit" disabled={!e.artist && !e.track && !e.noticed}>
              {L.add}
            </button>
            {saved && <span className="small muted">{saved}</span>}
          </div>
        </form>
      )}
    </section>
  );
}

function WriteToMe({ view, L, actions, pending }: { view: FamilyView; L: ReturnType<typeof labels>; actions?: FamilyActions; pending?: boolean }) {
  const [text, setText] = useState("");
  const [sent, setSent] = useState("");
  return (
    <section className="family-block write">
      <h2>{L.writeToMe}</h2>
      <p>{L.writePrompt}</p>
      {view.notes.length > 0 && (
        <div className="stack-sm">
          <span className="label">{L.yourMessages}</span>
          {view.notes.map((n, i) => (
            <blockquote key={i} className="quote">
              {n.text}
            </blockquote>
          ))}
        </div>
      )}
      {actions && (
        <form
          className="stack-sm"
          onSubmit={async (ev) => {
            ev.preventDefault();
            const ok = await actions.write(text.trim());
            setSent(ok ? L.sent : L.notSaved);
            if (ok) setText("");
          }}
        >
          <textarea className="input" rows={3} value={text} onChange={(e) => setText(e.target.value)} aria-label={L.writeToMe} maxLength={1500} />
          <div className="row">
            <button className="btn btn-primary btn-sm" type="submit" disabled={!text.trim() || pending}>
              {L.send}
            </button>
            {sent && <span className="small muted">{sent}</span>}
          </div>
        </form>
      )}
    </section>
  );
}
