import { useEffect, useState, type ReactNode } from "react";
import { href, useRoute } from "./router";
import { store, useSync } from "./data/store";
import { setMuted } from "./music/audio";
import { applyTheme, getPref, setPref, type Theme } from "./prefs";
import { Icon, Logo } from "./components/ui";
import { SyncBadge } from "./components/SyncBadge";
import { Today } from "./pages/Today";
import { Capture } from "./pages/Capture";
import { Board } from "./pages/Board";
import { Students } from "./pages/Students";
import { StudentRecord } from "./pages/StudentRecord";
import { WeekEditor } from "./pages/WeekEditor";
import { Lessons, LessonReview } from "./pages/Lessons";
import { Promises } from "./pages/Promises";
import { Threads } from "./pages/Threads";
import { Reports } from "./pages/Reports";
import { ExportPage } from "./pages/Export";
import { SettingsPage } from "./pages/Settings";
import { More } from "./pages/More";
import { FamilyPage } from "./pages/Family";
import { Practice } from "./pages/Practice";

export function App() {
  const route = useRoute();
  const sync = useSync();
  const [theme, setTheme] = useState<Theme>(() => getPref<Theme>("theme", "system"));
  const [sound, setSound] = useState<boolean>(() => getPref("sound", true));

  useEffect(() => applyTheme(theme), [theme]);
  useEffect(() => setMuted(!sound), [sound]);

  // Keep the record fresh while the app is open: what families and the studio run wrote comes back here.
  useEffect(() => {
    if (sync.mode !== "notion" || sync.status === "signed out") return;
    void store.pull();
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") void store.pullLive();
    }, 60_000);
    const online = () => void store.flush();
    window.addEventListener("online", online);
    return () => {
      window.clearInterval(t);
      window.removeEventListener("online", online);
    };
  }, [sync.mode, sync.status === "signed out"]); // eslint-disable-line react-hooks/exhaustive-deps

  const section = route[0] ?? "";

  // The family page stands alone: no teacher chrome, no navigation into the studio.
  if (section === "f") {
    if (route[2] === "play") return <Practice token={route[1] ?? ""} game={route[3] ?? ""} />;
    return <FamilyPage token={route[1] ?? ""} />;
  }

  const signedOut = sync.mode === "notion" && sync.status === "signed out";
  let page: ReactNode;
  if (signedOut && section !== "settings") page = <SettingsPage theme={theme} onTheme={setThemePref} signInFirst />;
  else
    switch (section) {
      case "":
      case "today":
        page = <Today date={route[1]} />;
        break;
      case "lesson":
        page = <Capture studentId={route[1] ?? ""} />;
        break;
      case "board":
        page = <Board />;
        break;
      case "students":
        page = <Students />;
        break;
      case "s":
        page = route[2] === "week" && route[3] ? <WeekEditor studentId={route[1] ?? ""} weekId={route[3]} /> : <StudentRecord studentId={route[1] ?? ""} tab={route[2]} />;
        break;
      case "lessons":
        page = route[1] ? <LessonReview lessonId={route[1]} /> : <Lessons />;
        break;
      case "promises":
        page = <Promises />;
        break;
      case "threads":
        page = <Threads />;
        break;
      case "reports":
        page = <Reports />;
        break;
      case "export":
        page = <ExportPage day={route[1]} date={route[2]} />;
        break;
      case "settings":
        page = <SettingsPage theme={theme} onTheme={setThemePref} />;
        break;
      case "more":
        page = <More />;
        break;
      default:
        page = <Today />;
    }

  function setThemePref(t: Theme) {
    setTheme(t);
    setPref("theme", t);
  }

  const nav = [
    { to: "/", label: "Today", icon: "today", on: section === "" || section === "today" || section === "lesson" },
    { to: "/board", label: "Board", icon: "board", on: section === "board" },
    { to: "/students", label: "Students", icon: "people", on: section === "students" || section === "s" },
    { to: "/lessons", label: "Lessons", icon: "mic", on: section === "lessons", wide: true },
    { to: "/reports", label: "Reports", icon: "doc", on: section === "reports", wide: true },
    { to: "/more", label: "More", icon: "more", on: ["more", "promises", "threads", "export", "settings"].includes(section) },
  ];
  const nextTheme: Theme = theme === "dark" ? "light" : theme === "light" ? "system" : "dark";

  return (
    <div className="shell">
      <div className="band" aria-hidden="true" />
      <header className="topbar">
        <a className="brand" href={href("/")} aria-label="Bravissimo, today">
          <Logo />
          <span>Bravissimo</span>
        </a>
        {sync.mode === "demo" && <span className="pill pill-peach">Demo studio</span>}
        <nav className="topnav" aria-label="Main">
          {!signedOut &&
            nav.map((n) => (
              <a key={n.to} className="navlink" href={href(n.to)} aria-current={n.on ? "page" : undefined}>
                {n.label}
              </a>
            ))}
          <SyncBadge />
          <button
            className="navlink icon-only"
            type="button"
            onClick={() => {
              setSound(!sound);
              setPref("sound", !sound);
            }}
            aria-label={sound ? "Mute sounds" : "Turn sounds on"}
            title={sound ? "Sound on" : "Sound off"}
          >
            <Icon name={sound ? "sound" : "mute"} />
          </button>
          <button className="navlink icon-only" type="button" onClick={() => setThemePref(nextTheme)} aria-label={`Theme: ${theme}. Switch to ${nextTheme}`} title={`Theme: ${theme}`}>
            <Icon name={theme === "dark" ? "moon" : "sun"} />
          </button>
        </nav>
      </header>
      <main className="main" id="main">
        {store.saveError() && (
          <div className="banner" role="alert">
            This device could not save the last change ({store.saveError()}).
          </div>
        )}
        {page}
      </main>
      {!signedOut && (
        <nav className="bottomnav" aria-label="Main">
          {nav
            .filter((n) => !n.wide)
            .map((n) => (
              <a key={n.to} href={href(n.to)} aria-current={n.on ? "page" : undefined}>
                <Icon name={n.icon} />
                {n.label}
              </a>
            ))}
        </nav>
      )}
    </div>
  );
}
