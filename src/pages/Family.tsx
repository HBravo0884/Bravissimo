import { useCallback, useEffect, useState } from "react";
import { apiBase, store } from "../data/store";
import { familyView, latestFamilyWeek } from "../../shared/family";
import { labels } from "../../shared/labels";
import { toggleTick } from "../../shared/records";
import { isoDate } from "../../shared/dates";
import type { FamilyView, ListeningEntry } from "../../shared/types";
import { FamilyWeek, type FamilyActions } from "../components/FamilyWeek";
import { Logo } from "../components/ui";

const QUEUE_KEY = "bravissimo.family.queue";

type Action = Record<string, unknown> & { action: string };

function readQueue(): Action[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]") as Action[];
  } catch {
    return [];
  }
}
function writeQueue(q: Action[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-50)));
  } catch {
    /* nothing to do */
  }
}

async function post(body: Action): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`${apiBase}/family`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) return res.status >= 500 ? null : {};
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Demo links read the demo studio on this device, so the family page can be tried without Notion. */
function demoView(token: string): FamilyView | null {
  const d = store.data();
  const s = d.students.find((x) => x.familyKey === token);
  if (!s) return null;
  return familyView({ student: s, week: latestFamilyWeek(d.weeks, s.id), challenges: d.challenges, progress: d.progress, rungs: d.rungs, resources: d.resources });
}

export function FamilyPage({ token }: { token: string }) {
  const demo = token.startsWith("demo");
  const [view, setView] = useState<FamilyView | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "offline">("loading");
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    if (demo) {
      const v = demoView(token);
      setView(v);
      setState(v ? "ready" : "missing");
      return;
    }
    try {
      // Send anything that was waiting for a connection first.
      const queued = readQueue().filter((a) => a.k === token);
      const rest = readQueue().filter((a) => a.k !== token);
      const left: Action[] = [];
      for (const a of queued) if ((await post(a)) === null) left.push(a);
      writeQueue([...rest, ...left]);
      const res = await fetch(`${apiBase}/family?k=${encodeURIComponent(token)}`);
      if (res.status === 404) {
        setState("missing");
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      setView((await res.json()) as FamilyView);
      setState("ready");
    } catch {
      setState((s) => (s === "ready" ? "ready" : "offline"));
    }
  }, [demo, token]);

  useEffect(() => {
    document.title = "This week";
    void load();
    const on = () => void load();
    window.addEventListener("online", on);
    return () => window.removeEventListener("online", on);
  }, [load]);

  const send = async (a: Action): Promise<Record<string, unknown> | null> => {
    setPending(true);
    const r = await post({ ...a, k: token });
    setPending(false);
    if (r === null) writeQueue([...readQueue(), { ...a, k: token }]);
    return r;
  };

  const actions: FamilyActions | undefined = view && !view.empty
    ? demo
      ? {
          tick(card, day, on) {
            const w = store.data().weeks.find((x) => x.id === view.week);
            if (!w) return;
            store.update("weeks", w.id, { ticks: toggleTick(w.ticks, card, day, on, "app", isoDate()) });
            setView(demoView(token));
          },
          gotIt(card) {
            const w = store.data().weeks.find((x) => x.id === view.week);
            if (!w) return;
            store.update("weeks", w.id, { gotIt: { ...w.gotIt, [card]: isoDate() } });
            setView(demoView(token));
          },
          async write(text) {
            const w = store.data().weeks.find((x) => x.id === view.week);
            if (!w) return false;
            store.update("weeks", w.id, { notes: [...w.notes, { text, on: new Date().toISOString() }] });
            setView(demoView(token));
            return true;
          },
          async listen(entry) {
            const w = store.data().weeks.find((x) => x.id === view.week);
            if (!w) return false;
            store.update("weeks", w.id, { listening: [...w.listening, { ...entry, on: new Date().toISOString() }] });
            setView(demoView(token));
            return true;
          },
        }
      : {
          tick(card, day, on) {
            // Show it at once; the server merges it with anything ticked elsewhere.
            setView((v) => (v ? { ...v, ticks: on ? [...v.ticks.filter((t) => !(t.card === card && t.day === day)), { card, day }] : v.ticks.filter((t) => !(t.card === card && t.day === day)) } : v));
            void send({ action: "tick", week: view.week, card, day, on }).then((r) => {
              if (r && Array.isArray(r.ticks)) setView((v) => (v ? { ...v, ticks: r.ticks as FamilyView["ticks"] } : v));
            });
          },
          gotIt(card) {
            setView((v) => (v ? { ...v, cards: v.cards.map((c) => (c.id === card ? { ...c, gotIt: isoDate() } : c)) } : v));
            void send({ action: "gotit", week: view.week, card });
          },
          async write(text) {
            const r = await send({ action: "write", week: view.week, text });
            if (r && Array.isArray(r.notes)) setView((v) => (v ? { ...v, notes: r.notes as FamilyView["notes"] } : v));
            return !!r;
          },
          async listen(entry: Omit<ListeningEntry, "on">) {
            const r = await send({ action: "listen", week: view.week, entry });
            if (r && Array.isArray(r.listening)) setView((v) => (v ? { ...v, listening: r.listening as ListeningEntry[] } : v));
            return !!r;
          },
        }
    : undefined;

  const L = labels(view?.lang ?? "en");
  return (
    <div className="family-shell">
      <div className="band" aria-hidden="true" />
      <main className="family-main">
        {state === "loading" && (
          <p className="family-status">
            <Logo size={28} /> {L.loading}
          </p>
        )}
        {state === "missing" && <p className="card pad">{labels("en").notFound} {labels("es").notFound}</p>}
        {state === "offline" && !view && <p className="card pad">{L.notSaved}</p>}
        {view && <FamilyWeek view={view} actions={actions} pending={pending} gamesHref={`#/f/${token}/play/notes`} />}
      </main>
    </div>
  );
}
