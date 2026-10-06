import { studioSnapshot, useData, useSync } from "../data/store";
import { owedPromises, openThreads } from "../../shared/board";
import { href } from "../router";
import { Icon } from "../components/ui";

export function More() {
  const promises = useData("promises");
  const threads = useData("threads");
  const lessons = useData("lessons");
  const sync = useSync();
  const toReview = lessons.filter((l) => !l.status || l.status === "Transcript only" || !l.whatChanged).length;
  const items = [
    { to: "/lessons", icon: "mic", label: "Lesson records", sub: toReview ? `${toReview} to review` : "Nothing waiting" },
    { to: "/reports", icon: "doc", label: "Reports", sub: "Who is due, drafts, the posted tick" },
    { to: "/promises", icon: "promise", label: "Promises", sub: `${owedPromises(promises).length} owed` },
    { to: "/threads", icon: "thread", label: "Threads", sub: `${openThreads(threads).length} open` },
    { to: "/export", icon: "download", label: "Records file", sub: "The JSON the sheet generator prints from" },
    { to: "/games", icon: "play", label: "Practice games", sub: "Try the games the family page opens; nothing is recorded" },
    { to: "/settings", icon: "gear", label: "Settings", sub: sync.mode === "demo" ? (studioSnapshot() ? "A snapshot of your studio" : "Demo studio") : "Notion" },
  ];
  return (
    <div className="stack page-narrow">
      <header className="page-head">
        <h1>More</h1>
      </header>
      <ul className="list card">
        {items.map((i) => (
          <li key={i.to}>
            <a className="list-row" href={href(i.to)}>
              <Icon name={i.icon} />
              <div className="grow">
                <b>{i.label}</b>
                <div className="small muted">{i.sub}</div>
              </div>
              <Icon name="next" size={18} />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
