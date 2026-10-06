import { ordinal, parseDate } from "./dates";
import type { Lang } from "./types";

/**
 * Family-facing words, English and Spanish. The sheet's labels are the ones
 * the weekly sheet generator prints (its L10N table); the rest are the app's
 * own. No exclamation marks, no emoji, no dashes.
 */
export const LABELS = {
  en: {
    wins: "Recent wins",
    song: "Your song right now",
    recitalSong: "Your recital song",
    last: "Last time",
    cards: "This week",
    doneWhen: "Done when",
    stillTrue: "Still true when",
    fromShelf: "From the shelf",
    routine: "Practice routine",
    minimumDay:
      "On a day when none of that happens: five minutes on your song, once, and still tick the box. That is worth more than a long session you never get to.",
    picture: "The picture for this week",
    quiz: "Fill in the blanks",
    challenges: "Challenges you are working on",
    challengesNote: "Each block is one step; every practice day counts toward the practice packet.",
    listening: "Listening log",
    listeningSub: "Play something from your playlist this week and fill this in.",
    artist: "Artist",
    track: "Track",
    noticed: "One thing I noticed",
    steal: "One thing I want to steal",
    keep: "Keep it alive",
    writeToMe: "Write to me",
    writePrompt: "What was the hard part this week? Write it here and I will start there.",
    playlist: "Playlist",
    music: "Music",
    codes: "Links",
    adultNote: "At home",
    noPlaylist: "Ask me for your playlist link and I will send it.",
    quizSub: "Try it without the sheet in front of you. Bring it back next lesson.",
    preparedBy: "Prepared by Hector Bravo",
    youPick: "You pick",
    tickHelp: "Tap a box for each day you practice this card.",
    practiceDays: (n: number) => (n === 1 ? "1 practice day so far" : `${n} practice days so far`),
    gotIt: "I think I've got it",
    gotItNoted: "Noted. Play it for me at your lesson.",
    send: "Send",
    sent: "Sent. I will read it before your lesson.",
    add: "Add",
    saved: "Saved",
    notSaved: "Not saved yet. It will send when you are back online.",
    sheets: "Your sheets",
    now: "Now",
    before: "Before this",
    next: "Next",
    notReady: "Your sheet for this week is not ready yet. Check back after your lesson.",
    notFound: "This link is not active. Ask for a new one at your lesson.",
    loading: "Opening your week",
    games: "Practice games",
    language: "Español",
    yourMessages: "What you wrote",
  },
  es: {
    wins: "Lo que salió bien",
    song: "Tu pieza ahora",
    recitalSong: "Tu pieza del recital",
    last: "La última vez",
    cards: "Esta semana",
    doneWhen: "Listo cuando",
    stillTrue: "Sigue siendo cierto cuando",
    fromShelf: "Del estante",
    routine: "Rutina de práctica",
    minimumDay:
      "Un día en que nada de eso pase: cinco minutos con tu pieza, una vez, y marca la casilla igual. Vale más que una sesión larga que nunca llega.",
    picture: "La imagen de esta semana",
    quiz: "Completa los espacios",
    challenges: "Retos en los que trabajas",
    challengesNote: "Cada bloque es un paso; cada día de práctica cuenta para el paquete de práctica.",
    listening: "Registro de escucha",
    listeningSub: "Escucha algo de tu lista esta semana y completa esto.",
    artist: "Artista",
    track: "Canción",
    noticed: "Algo que noté",
    steal: "Algo que quiero copiar",
    keep: "Mantenlo vivo",
    writeToMe: "Escríbeme",
    writePrompt: "¿Cuál fue la parte difícil esta semana? Escríbela aquí y empezamos por ahí.",
    playlist: "Lista",
    music: "Música",
    codes: "Enlaces",
    adultNote: "En casa",
    noPlaylist: "Pídeme el enlace de tu lista y te lo envío.",
    quizSub: "Inténtalo sin la hoja delante. Tráela a la próxima lección.",
    preparedBy: "Preparado por Hector Bravo",
    youPick: "Tú eliges",
    tickHelp: "Toca una casilla por cada día que practiques esta tarjeta.",
    practiceDays: (n: number) => (n === 1 ? "1 día de práctica hasta ahora" : `${n} días de práctica hasta ahora`),
    gotIt: "Creo que ya lo tengo",
    gotItNoted: "Anotado. Tócamelo en tu clase.",
    send: "Enviar",
    sent: "Enviado. Lo leeré antes de tu clase.",
    add: "Agregar",
    saved: "Guardado",
    notSaved: "Todavía no se guardó. Se enviará cuando vuelvas a tener conexión.",
    sheets: "Tus hojas",
    now: "Ahora",
    before: "Antes de esta",
    next: "Siguiente",
    notReady: "Tu hoja de esta semana todavía no está lista. Vuelve a mirar después de tu clase.",
    notFound: "Este enlace no está activo. Pide uno nuevo en tu clase.",
    loading: "Abriendo tu semana",
    games: "Juegos de práctica",
    language: "English",
    yourMessages: "Lo que escribiste",
  },
} satisfies Record<Lang, Record<string, string | ((n: number) => string)>>;

export type LabelSet = (typeof LABELS)["en"];

export function labels(lang: Lang): LabelSet {
  return LABELS[lang] ?? LABELS.en;
}

/** The carry-over tag, in the sheet's language: "Carried over from the 21st." / "viene de la hoja anterior". */
export function carriedTag(fromIso: string, lang: Lang): string {
  if (!fromIso) return "";
  if (lang === "es") return "viene de la hoja anterior";
  return `Carried over from the ${ordinal(parseDate(fromIso).getDate())}.`;
}

/** The "Last time" line for a sheet built from a lesson that left no record. */
export function noRecordLine(lastRecordIso: string, lang: Lang): string {
  const day = lastRecordIso ? parseDate(lastRecordIso).getDate() : 0;
  if (lang === "es") {
    return day
      ? `Las tarjetas de la semana pasada siguen; mi registro del ${day} termina antes de tu clase. Tacha lo que ya hiciste.`
      : "Las tarjetas de la semana pasada siguen. Tacha lo que ya hiciste.";
  }
  return day
    ? `Last week's cards carry over; my record of the ${ordinal(day)} stops before your lesson. Cross off what is done.`
    : "Last week's cards carry over. Cross off what is done.";
}
