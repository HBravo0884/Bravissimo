/** Per-device conveniences (theme, last game setup). Safe to lose; never holds scores. */
const KEY = "bravissimo.prefs";

type Prefs = Record<string, unknown>;

function read(): Prefs {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Prefs;
  } catch {
    return {};
  }
}

export function getPref<T>(name: string, fallback: T): T {
  const v = read()[name];
  return v === undefined ? fallback : (v as T);
}

export function setPref(name: string, value: unknown) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...read(), [name]: value }));
  } catch {
    /* private mode or storage full: preferences just won't stick */
  }
}

export type Theme = "system" | "light" | "dark";

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}
