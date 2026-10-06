/** Calendar helpers. Dates are local YYYY-MM-DD strings; the studio runs on one clock. */

export function isoDate(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseDate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function addDays(iso: string, n: number): string {
  const d = parseDate(iso);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86_400_000);
}

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
const WEEKDAYS_ES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTHS_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export function weekdayOf(iso: string): (typeof WEEKDAYS)[number] {
  return WEEKDAYS[parseDate(iso).getDay()];
}

/** The next date (today included) that falls on the given weekday. */
export function nextWeekday(day: string, from = isoDate()): string {
  const want = WEEKDAYS.indexOf(day as (typeof WEEKDAYS)[number]);
  if (want < 0) return from;
  const d = parseDate(from);
  const diff = (want - d.getDay() + 7) % 7;
  return addDays(from, diff);
}

/** 21 -> "21st". */
export function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

/** "Monday, October 5" or "lunes 5 de octubre". Sheets for Spanish-reading families are Spanish, dates included. */
export function longDate(iso: string, lang: "en" | "es" = "en"): string {
  if (!iso) return "";
  const d = parseDate(iso);
  if (lang === "es") return `${WEEKDAYS_ES[d.getDay()]} ${d.getDate()} de ${MONTHS_ES[d.getMonth()]}`;
  return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** "Oct 5". */
export function shortDate(iso: string, lang: "en" | "es" = "en"): string {
  if (!iso) return "";
  const d = parseDate(iso);
  if (lang === "es") return `${d.getDate()} ${MONTHS_ES[d.getMonth()].slice(0, 3)}`;
  return `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}`;
}

export function monthName(iso: string, lang: "en" | "es" = "en"): string {
  const d = parseDate(iso);
  return lang === "es" ? MONTHS_ES[d.getMonth()] : MONTHS[d.getMonth()];
}

/** "4:30 PM" -> minutes after midnight, for slot order. */
export function minutesOfTime(t: string): number {
  const m = /(\d{1,2}):(\d{2})\s*(AM|PM)?/i.exec(t);
  if (!m) return 24 * 60;
  let h = Number(m[1]) % 12;
  if ((m[3] ?? "").toUpperCase() === "PM") h += 12;
  return h * 60 + Number(m[2]);
}

/** "4:30 PM" -> "4:30". */
export function clockLabel(t: string): string {
  return t.replace(/\s*(AM|PM)\s*$/i, "").trim();
}

export function nowStamp(d = new Date()): string {
  return d.toISOString();
}

/** "16:42" from an ISO timestamp, in local time. */
export function timeOfDay(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}
