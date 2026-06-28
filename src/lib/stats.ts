import { MAX_GUESSES } from "@/lib/constants";

export type GameStatus = "playing" | "won" | "lost";

export type Progress = {
  guesses: string[];
  status: GameStatus;
};

export type Stats = {
  played: number;
  wins: number;
  currentStreak: number;
  maxStreak: number;
  /** Day number of the most recently *completed* game (win or loss). */
  lastCompletedDay: number | null;
  /** Map of winning guess count (1..MAX_GUESSES) → number of wins. */
  distribution: Record<number, number>;
};

const PROGRESS_PREFIX = "born2die:progress:";
const STATS_KEY = "born2die:stats";

function emptyDistribution(): Record<number, number> {
  const dist: Record<number, number> = {};
  for (let i = 1; i <= MAX_GUESSES; i++) dist[i] = 0;
  return dist;
}

export function defaultStats(): Stats {
  return {
    played: 0,
    wins: 0,
    currentStreak: 0,
    maxStreak: 0,
    lastCompletedDay: null,
    distribution: emptyDistribution(),
  };
}

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function loadProgress(day: number): Progress | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(PROGRESS_PREFIX + day);
    return raw ? (JSON.parse(raw) as Progress) : null;
  } catch {
    return null;
  }
}

export function saveProgress(day: number, progress: Progress): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(PROGRESS_PREFIX + day, JSON.stringify(progress));
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}

/** Dev helper: wipe a single day's saved progress so it can be replayed. */
export function clearProgress(day: number): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(PROGRESS_PREFIX + day);
  } catch {
    /* ignore */
  }
}

/** Dev helper: wipe all lifetime stats. */
export function clearStats(): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(STATS_KEY);
  } catch {
    /* ignore */
  }
}

export function loadStats(): Stats {
  if (!isBrowser()) return defaultStats();
  try {
    const raw = window.localStorage.getItem(STATS_KEY);
    if (!raw) return defaultStats();
    const parsed = JSON.parse(raw) as Partial<Stats>;
    return { ...defaultStats(), ...parsed, distribution: { ...emptyDistribution(), ...parsed.distribution } };
  } catch {
    return defaultStats();
  }
}

function saveStats(stats: Stats): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch {
    /* ignore */
  }
}

/**
 * Records a completed game exactly once per day. Returns the updated stats.
 * Streak rules (Wordle-style): a win extends the streak only if the previous
 * completed day was the immediately preceding day; otherwise it resets to 1.
 * A loss breaks the streak.
 */
export function recordResult(
  day: number,
  won: boolean,
  guessCount: number,
): Stats {
  const stats = loadStats();

  // Guard: never double-count the same day.
  if (stats.lastCompletedDay === day) return stats;

  const next: Stats = {
    ...stats,
    distribution: { ...stats.distribution },
  };

  next.played += 1;
  if (won) {
    next.wins += 1;
    const continues = stats.lastCompletedDay === day - 1 && stats.currentStreak > 0;
    next.currentStreak = continues ? stats.currentStreak + 1 : 1;
    next.maxStreak = Math.max(stats.maxStreak, next.currentStreak);
    if (guessCount >= 1 && guessCount <= MAX_GUESSES) {
      next.distribution[guessCount] = (next.distribution[guessCount] ?? 0) + 1;
    }
  } else {
    next.currentStreak = 0;
  }
  next.lastCompletedDay = day;

  saveStats(next);
  return next;
}
