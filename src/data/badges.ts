import type { Session } from "./model";
import { accuracy, practiceStreak } from "./stats";

export interface Badge {
  id: string;
  name: string;
  icon: string;
  description: string;
  /** True when the student's sessions earn the badge. */
  earned: (sessions: Session[]) => boolean;
}

const totalCorrect = (ss: Session[]) => ss.reduce((n, s) => n + s.correct, 0);

/**
 * Badges reward showing up and getting steadier, never comparing students
 * (siblings already compare point totals; the studio doesn't want more of that).
 */
export const BADGES: Badge[] = [
  { id: "first", name: "First Steps", icon: "🎹", description: "Finish your first game", earned: (ss) => ss.length > 0 },
  { id: "streak3", name: "On a Roll", icon: "🔥", description: "Practice three days in a row", earned: (ss) => practiceStreak(ss).longest >= 3 },
  { id: "streak7", name: "Week Warrior", icon: "📅", description: "Practice seven days in a row", earned: (ss) => practiceStreak(ss).longest >= 7 },
  { id: "streak30", name: "Monthly Maestro", icon: "🏆", description: "Practice thirty days in a row", earned: (ss) => practiceStreak(ss).longest >= 30 },
  {
    id: "sharp",
    name: "Sharpshooter",
    icon: "🎯",
    description: "A perfect game with at least 15 answers",
    earned: (ss) => ss.some((s) => s.attempts >= 15 && s.correct === s.attempts),
  },
  { id: "combo10", name: "Combo 10", icon: "⚡", description: "Ten right in a row", earned: (ss) => ss.some((s) => s.bestStreak >= 10) },
  { id: "combo25", name: "Combo 25", icon: "🌟", description: "Twenty-five right in a row", earned: (ss) => ss.some((s) => s.bestStreak >= 25) },
  {
    id: "quick",
    name: "Quick Reader",
    icon: "👀",
    description: "20+ notes, 90% right, under 1.5 seconds each",
    earned: (ss) => ss.some((s) => s.game === "notes" && s.attempts >= 20 && accuracy(s) >= 0.9 && s.avgMs > 0 && s.avgMs < 1500),
  },
  {
    id: "clefs",
    name: "Both Clefs",
    icon: "🎼",
    description: "Play note games in treble and in bass",
    earned: (ss) => ss.some((s) => s.game === "notes" && s.variant === "treble") && ss.some((s) => s.game === "notes" && s.variant === "bass"),
  },
  {
    id: "explorer",
    name: "Explorer",
    icon: "🧭",
    description: "Try all four games",
    earned: (ss) => new Set(ss.map((s) => s.game)).size >= 4,
  },
  {
    id: "steady",
    name: "Steady Hands",
    icon: "🥁",
    description: "Clear a rhythm rung by tapping",
    earned: (ss) => ss.some((s) => s.game === "rhythm" && s.variant !== "match" && (s.cleared?.length ?? 0) > 0),
  },
  { id: "c100", name: "Century", icon: "💯", description: "100 right answers", earned: (ss) => totalCorrect(ss) >= 100 },
  { id: "c1000", name: "Thousand Club", icon: "🎉", description: "1,000 right answers", earned: (ss) => totalCorrect(ss) >= 1000 },
];

export function earnedBadges(sessions: Session[]): Badge[] {
  return BADGES.filter((b) => b.earned(sessions));
}

/** Badges a just-finished session unlocked. */
export function newlyEarned(before: Session[], after: Session[]): Badge[] {
  return BADGES.filter((b) => !b.earned(before) && b.earned(after));
}
