import type { GameId } from "./types";
import { RHYTHM_LEVELS } from "../music/rhythm";
import { FLASH_GAMES } from "./flash";

export interface GameInfo {
  id: GameId;
  name: string;
  tagline: string;
  /** Level Up category codes this game's minutes can feed. */
  codes: string[];
  /** Categorical color slot (1–4); identity only, always shown with the name. */
  slot: 1 | 2 | 3 | 4;
  stages: { name: string; blurb: string }[];
  variants: { id: string; label: string }[];
  variantLabel: string;
}

export const GAMES: GameInfo[] = [
  {
    id: "notes",
    name: "Note names",
    tagline: "Name the note on the staff, then find it on the keys.",
    codes: ["ML"],
    slot: 1,
    stages: FLASH_GAMES.notes.stages,
    variants: FLASH_GAMES.notes.variants,
    variantLabel: "Clef",
  },
  {
    id: "rhythm",
    name: "Subdivide",
    tagline: "Hear it, read it, tap it. Five in a row clears a level.",
    codes: ["CO", "ET"],
    slot: 2,
    stages: RHYTHM_LEVELS.map((l) => ({ name: l.name, blurb: l.teach })),
    variants: [
      { id: "match", label: "Listen & match" },
      { id: "read", label: "Read & tap" },
      { id: "echo", label: "Hear & tap" },
    ],
    variantLabel: "Mode",
  },
  {
    id: "intervals",
    name: "How far apart",
    tagline: "Two notes on the staff: name the distance.",
    codes: ["TH", "ET"],
    slot: 3,
    stages: FLASH_GAMES.intervals.stages,
    variants: FLASH_GAMES.intervals.variants,
    variantLabel: "Clef",
  },
  {
    id: "keys",
    name: "Key signatures",
    tagline: "Name the major key from its sharps or flats.",
    codes: ["TH"],
    slot: 4,
    stages: FLASH_GAMES.keys.stages,
    variants: FLASH_GAMES.keys.variants,
    variantLabel: "Clef",
  },
];

export const GAME_BY_ID = Object.fromEntries(GAMES.map((g) => [g.id, g])) as Record<GameId, GameInfo>;

/** Short label for one stats item, for dashboards and "practice these" lists. */
export function itemLabel(game: GameId, item: string): string {
  if (game === "rhythm") {
    const [, rung, mode] = item.split(":");
    const m = GAME_BY_ID.rhythm.variants.find((v) => v.id === mode)?.label ?? mode;
    return `${RHYTHM_LEVELS[Number(rung)]?.name ?? item} · ${m}`;
  }
  return FLASH_GAMES[game].itemLabel(item);
}

export function stageName(game: GameId, stage: number): string {
  return GAME_BY_ID[game].stages[stage]?.name ?? `Stage ${stage + 1}`;
}

export function variantName(game: GameId, variant: string): string {
  return GAME_BY_ID[game].variants.find((v) => v.id === variant)?.label ?? variant;
}
