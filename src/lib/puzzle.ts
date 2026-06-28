export type Marker = {
  /** Latitude in decimal degrees */
  lat: number;
  /** Longitude in decimal degrees */
  lng: number;
  /** Year shown above the marker */
  year: number;
  /** Human-readable place name (for tooltips / accessibility) */
  place: string;
};

export type Puzzle = {
  /** Stable identifier for the puzzle */
  id: string;
  /** The answer (kept client-side only during Phase 0 spike) */
  answer: string;
  /** Accepted alternative spellings/names that also count as correct */
  aliases?: string[];
  /**
   * Ordered textual hints revealed one-per-wrong-guess, AFTER the map-labels
   * reveal (which is hint #1 and handled as a map mechanic, not text).
   */
  hints?: string[];
  birth: Marker;
  death: Marker;
};

/**
 * Formats a marker year for display. Years are stored as integers where a
 * negative value means BCE, so -383 renders as "384 BC" (no year zero, but we
 * keep it simple and just take the magnitude) and 1914 renders as "1914".
 */
export function formatYear(year: number): string {
  return year < 0 ? `${Math.abs(year)} BC` : String(year);
}

/**
 * Normalizes a name for comparison: lowercases, strips diacritics, removes
 * punctuation, and collapses whitespace. So "Franz Ferdinand" and
 * "franz  ferdinand!" compare equal.
 */
export function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritic marks
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Returns true if a guess matches the puzzle's answer or any alias. */
export function isCorrectGuess(guess: string, puzzle: Puzzle): boolean {
  const target = normalizeName(guess);
  if (!target) return false;
  const accepted = [puzzle.answer, ...(puzzle.aliases ?? [])].map(normalizeName);
  return accepted.includes(target);
}

/**
 * Phase 0 hardcoded puzzle used to validate the map UX.
 * Charlie Kirk: born Arlington Heights, IL 1993, died Orem, UT 2025.
 */
export const SAMPLE_PUZZLE: Puzzle = {
  id: "sample-charlie-kirk",
  answer: "Charlie Kirk",
  aliases: ["Charles Kirk", "Charlie James Kirk"],
  hints: [
    "Made his name in politics and media.",
    "Conservative activist and media personality.",
    "Founder of Turning Point USA.",
  ],
  birth: { lat: 42.0884, lng: -87.9806, year: 1993, place: "Arlington Heights, Illinois" },
  death: { lat: 40.2969, lng: -111.6946, year: 2025, place: "Orem, Utah" },
};
