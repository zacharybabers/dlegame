import { MAX_GUESSES } from "@/lib/constants";
import { isCorrectGuess, type Puzzle } from "@/lib/puzzle";
import type { GameStatus } from "@/lib/stats";

/**
 * Emoji palettes for the share grid. `default` is the classic green/red;
 * `colorblind` swaps to blue/orange (wired to the colorblind setting in a later
 * subphase). Squares are 1:1 with the player's guesses.
 */
export const SHARE_PALETTES = {
  default: { correct: "🟩", wrong: "🟥" },
  colorblind: { correct: "🟦", wrong: "🟧" },
} as const;

export type SharePalette = keyof typeof SHARE_PALETTES;

/** One square per guess: correct (final right guess) vs wrong. */
export function buildShareGrid(
  guesses: string[],
  puzzle: Puzzle,
  palette: SharePalette = "default",
): string {
  const sq = SHARE_PALETTES[palette];
  return guesses
    .map((g) => (isCorrectGuess(g, puzzle) ? sq.correct : sq.wrong))
    .join("");
}

/**
 * Builds the shareable, spoiler-free result text (Wordle-style):
 *
 *   born2die #909 4/5
 *   🟥🟥🟥🟩
 *   https://born2die.example
 *
 * A loss scores `X/5`. The grid never reveals the answer — only hit/miss per
 * guess. `url` is appended as a final line when provided.
 */
export function buildShareText({
  dayNumber,
  guesses,
  status,
  puzzle,
  palette = "default",
  url,
}: {
  dayNumber: number;
  guesses: string[];
  status: GameStatus;
  puzzle: Puzzle;
  palette?: SharePalette;
  url?: string;
}): string {
  const score =
    status === "won" ? `${guesses.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`;
  const lines = [
    `born2die #${dayNumber} ${score}`,
    buildShareGrid(guesses, puzzle, palette),
  ];
  if (url) lines.push(url);
  return lines.join("\n");
}
