import { addDays, isoDate, nextWeekday } from "../../shared/dates";
import { blankCard, blankSheet } from "../../shared/records";
import type { Card, CardCode, Lane, Lesson, PromiseItem, Progress, RepertoireItem, Report, Resource, Rung, SkillItem, Song, Student, StudentChallenge, Thread, Week } from "../../shared/types";
import type { Data } from "./store";

/**
 * An invented studio for trying the app and for tests. Every name, piece
 * pairing, slot and link here is made up; no real student is in the code.
 */

const ACCENTS = ["#097C87", "#065E68", "#1C7294", "#1B6D5E", "#317F73", "#D22B27", "#9B1414", "#084365"];

function student(i: number, over: Partial<Student>): Student {
  const letter = String.fromCharCode(65 + i);
  return {
    id: `demo_s${i}`,
    name: `Student ${letter} Demo`,
    displayName: `Student ${letter}`,
    status: "Active",
    slots: [],
    times: [],
    location: "Annandale",
    sessions: ["30"],
    age: null,
    ageBand: "8 to 10",
    levelUp: "1",
    playlist: "https://www.youtube.com/playlist?list=PLDEMO000000000000",
    goalPiece: "",
    repertoire: "",
    fern: "Notes",
    prescription: [],
    sprint: "",
    creative: "",
    experience: ["Beginner"],
    folder: "",
    lang: "en",
    familyLang: "en",
    accent: ACCENTS[i % ACCENTS.length],
    pointsMode: "plays for points",
    flags: [],
    paBook: "",
    span15: null,
    span14: null,
    spanOn: "",
    adultName: "",
    familyKey: `demo${letter}${"x".repeat(20)}`,
    familyKeyOn: "",
    ...over,
  };
}

function card(code: CardCode, lane: Lane, t: string, d: string, done: string, extra: Partial<Card> = {}): Card {
  return { ...blankCard(), code, lane, t, d, done, ...extra };
}

export function demoData(today = isoDate()): Data {
  const monday = nextWeekday("Monday", addDays(today, -6));
  const thursday = nextWeekday("Thursday", addDays(today, -6));
  const saturday = nextWeekday("Saturday", addDays(today, -6));
  const dayDate: Record<string, string> = { Monday: monday, Thursday: thursday, Saturday: saturday };

  const students: Student[] = [
    student(0, { slots: ["Monday 1"], times: ["4:00 PM"], age: 9, fern: "Rhythm", goalPiece: "Canon in D, easy arrangement", repertoire: "Ode to Joy" }),
    student(1, { slots: ["Monday 2"], times: ["4:30 PM"], age: 12, ageBand: "11 to 13", fern: "Fingering", repertoire: "Minuet in G" }),
    student(2, { slots: ["Monday 3"], times: ["5:00 PM"], age: 7, ageBand: "under 8", fern: "Notes", lang: "es", familyLang: "es", repertoire: "Lightly Row" }),
    student(3, { slots: ["Thursday 1"], times: ["4:00 PM"], location: "Annandale", age: null, ageBand: "adult", pointsMode: "no points", fern: "Expression", experience: ["Intermediate"], repertoire: "Morning, from Peer Gynt" }),
    student(4, { slots: ["Thursday 2"], times: ["4:30 PM"], age: 10, fern: "Notes", repertoire: "Aura Lee", playlist: "" }),
    student(5, { slots: ["Saturday 1"], times: ["9:30 AM"], location: "Fairfax", age: 14, ageBand: "14 to 17", fern: "Expression", pointsMode: "musical feedback instead", repertoire: "Fur Elise, opening" }),
    student(6, { slots: ["Saturday 2"], times: ["10:00 AM"], location: "Fairfax", age: 8, fern: "Rhythm", repertoire: "Twinkle variations", flags: ["no eyes-closed or memory work"] }),
    student(7, { slots: ["Saturday 3"], times: ["10:30 AM"], location: "Fairfax", status: "Pause", age: 11, ageBand: "11 to 13", repertoire: "" }),
  ];

  const challenges: StudentChallenge[] = [];
  const ch = (s: Student, code: string, name: string, points: number, blocks: number, minutesGoal: number | null = null) => {
    const c: StudentChallenge = {
      id: `demo_ch${challenges.length}`,
      student: s.id,
      name,
      code,
      points,
      state: "open",
      criterion: "",
      blocks,
      minutesGoal,
      openedOn: addDays(today, -40),
      completedOn: "",
      inNotebook: false,
    };
    challenges.push(c);
    return c.id;
  };

  const weeks: Week[] = [];
  const lessons: Lesson[] = [];
  const progress: Progress[] = [];
  const repertoire: RepertoireItem[] = [];

  const pieces: Record<string, string[]> = {
    "Ode to Joy": ["The opening line", "Bars 1 to 4, right hand, thumb on C.", "Bars 1 to 4 with no stop, twice in a row."],
    "Minuet in G": ["The left hand alone", "Bars 1 to 8, left hand, say the finger numbers out loud.", "Bars 1 to 8 left hand with no stop."],
    "Lightly Row": ["Las primeras notas", "Compases 1 a 4, mano derecha, pulgar en C.", "Compases 1 a 4 sin parar, dos veces seguidas."],
    "Morning, from Peer Gynt": ["The first phrase, singing", "Bars 1 to 4, let the top note ring over the left hand.", "The top line sounds louder than the chord, twice running."],
    "Aura Lee": ["Hands together, line one", "Bars 1 to 4, hands together, slowly.", "Line one hands together with no stop."],
    "Fur Elise, opening": ["The E and D sharp turn", "Bars 1 to 2, right hand, fingers 5 4 5 4 5.", "The turn sounds even, three times in a row."],
    "Twinkle variations": ["Variation A rhythm", "Clap the first variation, then play it on C.", "The rhythm stays even through the first line."],
  };

  students.forEach((s, i) => {
    if (s.status !== "Active") return;
    const day = s.slots[0].split(" ")[0];
    const thisLesson = dayDate[day] ?? monday;
    const lastLesson = addDays(thisLesson, -7);
    const song = s.repertoire;
    const plays = s.pointsMode === "plays for points";
    const chPR = plays ? ch(s, "PR 1a", "100 Practices Completed Packet", 100, 2 + (i % 5)) : "";
    const chET = plays ? ch(s, "ET 1b", "250 Minutes Ear Training App Packet", 100, 1 + (i % 3), 250) : "";
    const [t, d, done] = pieces[song] ?? ["The opening", "Bars 1 to 4.", "Bars 1 to 4 with no stop."];
    const es = s.lang === "es";

    const makeSheet = (date: string, carried: boolean) => {
      const sheet = blankSheet();
      sheet.song = song;
      sheet.songNote = es ? "Primero mano derecha, luego izquierda, luego juntas. Despacio es el camino rápido." : "Right hand alone first, then left, then both. Slow is the fast way here.";
      sheet.last = es ? "La última vez: encontramos la posición de cinco dedos." : "Last time: we found the five-finger position for the opening.";
      sheet.cards = [
        card("PP", "Repertoire", t, d, done, carried ? { carriedFrom: addDays(date, -7) } : {}),
        card("ML", "Literacy", es ? "Nombra las notas primero" : "Name the notes first", es ? "Di el nombre de cada nota de la primera línea antes de tocarla." : "Say each note name in line one before you play it.", es ? "Cada nota de la primera línea nombrada sin contar desde C." : "Every note in line one named without counting up from C."),
        card("ET", "Ear", es ? "Tócalo de vuelta" : "Tap it back", es ? "The Rhythm Trainer, Modo A, tempo lento, los dos primeros botones." : "The Rhythm Trainer, Mode A, Tempo SLOW, Beat highlight ON, first two rhythm buttons.", es ? "Cinco seguidas." : "Five in a row.", { feeds: chET }),
        card("IC", "Creation", es ? "Tu frase de respuesta" : "Your answer phrase", es ? "Inventa cuatro compases en las teclas negras que respondan al comienzo." : "Make up four bars on the black keys that answer the opening.", es ? "Puedes tocar tus cuatro compases igual dos veces." : "You can play your four bars the same way twice.", { youPick: true }),
      ];
      sheet.routine = [
        { min: 5, text: es ? "patrón de cinco dedos en C, cada mano" : "five-finger pattern in C, each hand", kind: "warm-up", card: "" },
        { min: 10, text: es ? "las primeras notas" : "the opening line", kind: "card block", card: sheet.cards[0].id },
        { min: 5, text: es ? "nombres de notas" : "note names", kind: "card block", card: sheet.cards[1].id },
        { min: 5, text: es ? "tócalo de vuelta" : "tap it back", kind: "card block", card: sheet.cards[2].id },
        { min: 5, text: es ? "juego libre" : "free play", kind: "free play", card: "" },
      ];
      if (s.ageBand === "under 8") sheet.routine = sheet.routine.filter((_, k) => k !== 3);
      sheet.keep = es ? { t: "Tu primera pieza", d: "Una vez, cualquier día de esta semana." } : { t: "Your first piece", d: "Once through, any day this week." };
      sheet.challenges = plays ? [chPR, chET] : [];
      sheet.fig = "cmaj5";
      sheet.figSong = song;
      sheet.qr2 = { id: "rhythm_trainer" };
      sheet.askFirst = "Play me the opening line before I play anything.";
      if (s.ageBand !== "adult") sheet.adultNote = es ? { t: "En casa", d: "Un cuarto tranquilo, una hora fija, y pedir escuchar la pieza al final de la semana. No hace falta leer música ni corregir nada." } : { t: "At home", d: "A quiet room, a set time, and asking to hear the piece at the end of the week. You do not need to read music or correct anything." };
      return sheet;
    };

    const prev = makeSheet(lastLesson, false);
    prev.cards[0].outcome = i % 2 ? "met" : "not yet";
    prev.cards[0].outcomeOn = thisLesson <= today ? thisLesson : "";
    prev.wins = i % 3 === 0 ? [] : ["The opening line went through twice without a stop."];
    weeks.push({
      id: `demo_w${i}a`,
      student: s.id,
      date: lastLesson,
      status: "handed out",
      edition: 1,
      builtFrom: "lesson",
      sheet: prev,
      ticks: [1, 2, 4].slice(0, 1 + (i % 3)).map((dayN) => ({ card: prev.cards[0].id, day: dayN, on: addDays(lastLesson, dayN), source: "paper" as const })),
      notes: [],
      listening: [],
      gotIt: {},
      seen: "",
    });
    const cur = makeSheet(thisLesson, i % 2 === 0);
    weeks.push({
      id: `demo_w${i}b`,
      student: s.id,
      date: thisLesson,
      status: i === 1 ? "draft" : "verified",
      edition: 1,
      builtFrom: i % 4 === 3 ? "carried" : "lesson",
      sheet: cur,
      ticks: i === 0 ? [{ card: cur.cards[1].id, day: 1, on: thisLesson, source: "app" }] : [],
      notes: i === 0 ? [{ text: "The left hand in bar 6 was the hard part.", on: `${thisLesson}T19:12:00.000Z` }] : [],
      listening: [],
      gotIt: {},
      seen: "",
    });

    lessons.push({
      id: `demo_l${i}`,
      name: `${s.displayName}, ${lastLesson}`,
      date: lastLesson,
      student: s.id,
      location: s.location,
      status: i === 0 ? "Report posted" : i === 4 ? "Report drafted" : "Logged",
      whatChanged: i % 3 === 2 ? "Nothing changed in the opening; the left hand still stops at bar 3." : "Bar 6 into bar 7 went through without a stop for the first time.",
      evidence: i % 3 === 2 ? "Played it three times; each stopped at bar 3." : "Played bars 5 to 8 twice in a row with no stop.",
      assigned: "Four cards; the opening line, note names, tap it back, an answer phrase.",
      unresolved: i === 1 ? "Promised a simplified left hand for the middle section." : "",
      threads: [],
      transcript: "",
      report: "",
      startedAt: "",
      capture: { wins: [], parentAsks: [], notes: [], outcomes: [], recital: "" },
    });

    repertoire.push({
      id: `demo_r${i}`,
      student: s.id,
      title: song,
      song: "",
      role: "NOW",
      status: "in progress",
      sound: "O",
      startedOn: addDays(today, -30),
      finishedOn: "",
      chosenHow: "",
      scoreLink: "",
    });
    if (s.goalPiece) repertoire.push({ ...repertoire[repertoire.length - 1], id: `demo_r${i}g`, title: s.goalPiece, role: "goal piece", status: "starting", sound: "S" });

    progress.push({
      id: `demo_p${i}`,
      student: s.id,
      rung: i % 2 ? "T01" : "T00",
      kind: "rung",
      state: "current",
      item: null,
      promptSet: "",
      mark: "Verified",
      date: addDays(today, -20),
      source: "lesson",
      note: "",
    });
    progress.push({ ...progress[progress.length - 1], id: `demo_p${i}r`, rung: i % 3 ? "R02" : "R01" });
  });

  // One Skills Check in progress: a box to retest next week.
  progress.push(
    { id: "demo_sk1", student: "demo_s0", rung: "T00", kind: "skill", state: "Passed", item: 1, promptSet: "A", mark: "Verified", date: addDays(today, -7), source: "lesson", note: "" },
    { id: "demo_sk2", student: "demo_s0", rung: "T00", kind: "skill", state: "Practice", item: 2, promptSet: "A", mark: "Verified", date: addDays(today, -7), source: "lesson", note: "" },
  );

  const threads: Thread[] = [
    { id: "demo_t1", name: "Student A, the left hand stops at bar 3", kind: "Technique", status: "Advancing", student: "demo_s0", watching: "Bars 1 to 8 left hand with no stop.", nextMove: "Block the chords before playing them broken.", opened: addDays(today, -35), lastTouched: addDays(today, -7), lessons: [] },
    { id: "demo_t2", name: "Student C, reading from the bass clef", kind: "Reading", status: "Open", student: "demo_s2", watching: "Names a bass note without counting from C.", nextMove: "", opened: addDays(today, -30), lastTouched: addDays(today, -28), lessons: [] },
    { id: "demo_t3", name: "Studio, no record of what each student has played", kind: "Studio system", status: "Needs a decision", student: "", watching: "A played-already list exists for every student.", nextMove: "Backfill from the last six packs.", opened: addDays(today, -40), lastTouched: addDays(today, -40), lessons: [] },
  ];

  const promises: PromiseItem[] = [
    { id: "demo_pr1", what: "A simplified left hand for the middle section", student: "demo_s1", kind: "arrangement", state: "owed", saidOn: addDays(today, -7), recordingTime: "16:42", keptOn: "", where: "" },
    { id: "demo_pr2", what: "Add the recital recording to the playlist", student: "demo_s5", kind: "video on the playlist", state: "ongoing", saidOn: addDays(today, -12), recordingTime: "", keptOn: "", where: "" },
  ];

  const reports: Report[] = [
    { id: "demo_rep1", student: "demo_s0", name: "Student A, full report", kind: "full", lang: "en", state: "posted", lessons: ["demo_l0"], draftedOn: addDays(today, -20), postedOn: addDays(today, -18), body: "", fern: "Rhythm", parentVerb: "Ask to hear the opening line on Sunday." },
    { id: "demo_rep2", student: "demo_s1", name: "Student B, full report", kind: "full", lang: "en", state: "posted", lessons: [], draftedOn: addDays(today, -130), postedOn: addDays(today, -128), body: "", fern: "Fingering", parentVerb: "" },
  ];

  const rung = (code: string, ladder: string, order: number, title: string, doneWhen: string, needs: string[] = []): Rung => ({
    id: `demo_${code}`,
    code,
    ladder,
    title,
    titleEs: "",
    doneWhen,
    doneWhenEs: "",
    needs,
    order,
    pages: null,
    link: "",
    soundSource: "",
    recordGrid: "",
    kind: "",
  });
  // Placeholder rungs: the studio's real ladders live in Notion, not in the code.
  const rungs: Rung[] = [
    rung("R00", "R", 0, "Demo ear step one", "I can do the demo's first ear step."),
    rung("R01", "R", 1, "Demo ear step two", "I can do the demo's second ear step.", ["R00"]),
    rung("R02", "R", 2, "Demo ear step three", "I can do the demo's third ear step.", ["R01"]),
    rung("R03", "R", 3, "Demo ear step four", "I can do the demo's fourth ear step.", ["R02", "T00"]),
    rung("T00", "T", 0, "Demo theory sheet one", "I can do the demo's first theory sheet."),
    rung("T01", "T", 1, "Demo theory sheet two", "I can do the demo's second theory sheet.", ["T00"]),
    rung("T02", "T", 2, "Demo theory sheet three", "I can do the demo's third theory sheet.", ["T01"]),
  ];
  const skills: SkillItem[] = [1, 2, 3].map((n) => ({
    id: `demo_skill${n}`,
    rung: "T00",
    n,
    skill: `Demo skill ${n}`,
    show: "Shows it on the piano when asked.",
    pass: "3 of 3",
    promptA: "First prompt set.",
    promptB: "Second prompt set, for a retest.",
    extra: false,
    wrongMeans: "",
  }));

  const resources: Resource[] = [
    { id: "demo_res1", key: "rhythm_trainer", label: "The Rhythm Trainer", url: "https://www.therhythmtrainer.com/", what: "Plays a bar of rhythm; you click it back.", cost: "free", checked: "", teacherOnly: false },
    { id: "demo_res2", key: "tonedear", label: "Tonedear", url: "https://tonedear.com", what: "Intervals, chords and progressions by ear.", cost: "free", checked: "", teacherOnly: false },
    { id: "demo_res3", key: "musictheory_exercises", label: "musictheory.net", url: "https://musictheory.net/exercises", what: "Staff, keyboard and ear drills.", cost: "free", checked: "", teacherOnly: false },
  ];

  const songs: Song[] = ["Ode to Joy", "Minuet in G", "Lightly Row", "Aura Lee", "Morning, from Peer Gynt", "Fur Elise, opening", "Twinkle variations", "Canon in D, easy arrangement", "Jingle Bells", "Simple Gifts"].map((title, i) => ({
    id: `demo_song${i}`,
    title,
    level: `Level ${1 + (i % 4)}`,
    difficulty: "Easy",
    link: "",
    notes: "",
  }));

  return {
    students,
    weeks,
    lessons,
    threads,
    promises,
    progress,
    challenges,
    practice: [],
    repertoire,
    reports,
    songs,
    rungs,
    skills,
    resources,
  };
}
