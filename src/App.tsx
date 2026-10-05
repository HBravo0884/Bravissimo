import { useEffect, useState, type ReactNode } from "react";
import { href, useRoute } from "./router";
import { store, useDB } from "./data/store";
import { setMuted } from "./music/audio";
import { applyTheme, getPref, setPref, type Theme } from "./prefs";
import { Icon, Logo } from "./components/ui";
import { TeacherGate } from "./pages/TeacherGate";
import { Home } from "./pages/Home";
import { Hub } from "./pages/Hub";
import { PlayGame } from "./pages/PlayGame";
import { Teacher } from "./pages/Teacher";
import { StudentDetail } from "./pages/StudentDetail";
import { SettingsPage } from "./pages/Settings";
import { Join } from "./pages/Join";
import { ImportScores } from "./pages/ImportScores";

export function App() {
  const route = useRoute();
  const settings = useDB((db) => db.settings);
  const [theme, setTheme] = useState<Theme>(() => getPref<Theme>("theme", "system"));

  useEffect(() => applyTheme(theme), [theme]);
  useEffect(() => setMuted(!settings.sound), [settings.sound]);

  const homeDevice = !!settings.homeStudentId;
  const section = route[0] ?? "";
  const playing = section === "s" && route[2] === "play";

  let page: ReactNode;
  switch (section) {
    case "s":
      page = route[2] === "play" && route[3] ? <PlayGame studentId={route[1]} game={route[3]} /> : <Hub studentId={route[1]} />;
      break;
    case "teacher":
      page = <TeacherGate>{route[1] ? <StudentDetail studentId={route[1]} /> : <Teacher />}</TeacherGate>;
      break;
    case "settings":
      page = <TeacherGate>{<SettingsPage theme={theme} onTheme={(t) => (setTheme(t), setPref("theme", t))} />}</TeacherGate>;
      break;
    case "join":
      page = <Join code={route.slice(1).join("/")} />;
      break;
    case "import":
      page = (
        <TeacherGate>
          <ImportScores code={route.slice(1).join("/")} />
        </TeacherGate>
      );
      break;
    default:
      page = <Home />;
  }

  const nav = [
    { to: homeDevice ? `/s/${settings.homeStudentId}` : "/", label: "Play", icon: "play", on: section === "" || section === "s" },
    ...(homeDevice
      ? []
      : [
          { to: "/teacher", label: "Teacher", icon: "people", on: section === "teacher" },
          { to: "/settings", label: "Settings", icon: "gear", on: section === "settings" },
        ]),
  ];

  const nextTheme: Theme = theme === "dark" ? "light" : theme === "light" ? "system" : "dark";

  return (
    <div className="shell">
      {!playing && (
        <header className="topbar">
          <a className="brand" href={href(nav[0].to)} aria-label="Bravissimo home">
            <Logo />
            <span>Bravissimo</span>
          </a>
          <nav className="topnav" aria-label="Main">
            {nav.map((n) => (
              <a key={n.to} className="navlink" href={href(n.to)} aria-current={n.on ? "page" : undefined}>
                {n.label}
              </a>
            ))}
            <button
              className="navlink icon-only"
              type="button"
              onClick={() => store.updateSettings({ sound: !settings.sound })}
              aria-label={settings.sound ? "Mute sounds" : "Turn sounds on"}
              title={settings.sound ? "Sound on" : "Sound off"}
            >
              <Icon name={settings.sound ? "sound" : "mute"} />
            </button>
            <button
              className="navlink icon-only"
              type="button"
              onClick={() => {
                setTheme(nextTheme);
                setPref("theme", nextTheme);
              }}
              aria-label={`Theme: ${theme}. Switch to ${nextTheme}`}
              title={`Theme: ${theme}`}
            >
              <Icon name={theme === "dark" ? "moon" : "sun"} />
            </button>
          </nav>
        </header>
      )}
      <main className={`main ${playing ? "playing" : ""}`} id="main">
        {store.saveError() && <div className="banner" role="alert">This device couldn't save the last change ({store.saveError()}). Export a backup from Settings.</div>}
        {page}
      </main>
      {!playing && nav.length > 1 && (
        <nav className="bottomnav" aria-label="Main">
          {nav.map((n) => (
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
