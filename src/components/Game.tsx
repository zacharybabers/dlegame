"use client";

import { useEffect, useMemo, useState } from "react";
import MapPanel from "@/components/MapPanel";
import GuessInput from "@/components/GuessInput";
import StatsPanel from "@/components/StatsPanel";
import ShareButton from "@/components/ShareButton";
import Countdown from "@/components/Countdown";
import { MAX_GUESSES } from "@/lib/constants";
import { isCorrectGuess, type Puzzle } from "@/lib/puzzle";
import { buildShareText } from "@/lib/share";
import { useColorblind } from "@/lib/settings";
import {
  loadProgress,
  loadStats,
  recordResult,
  saveProgress,
  type GameStatus,
  type Stats,
} from "@/lib/stats";

type Hint =
  | { kind: "labels"; text: string }
  | { kind: "text"; text: string };

export default function Game({
  puzzle,
  candidates,
  dayNumber,
}: {
  puzzle: Puzzle;
  candidates: string[];
  dayNumber: number;
}) {
  const [guesses, setGuesses] = useState<string[]>([]);
  const [status, setStatus] = useState<GameStatus>("playing");
  const [stats, setStats] = useState<Stats | null>(null);
  // Gate interaction until we've read localStorage, so an early guess can't be
  // overwritten by hydration and we don't flash the input before showing a
  // previously-finished result.
  const [hydrated, setHydrated] = useState(false);
  const [colorblind] = useColorblind();

  // Hydrate today's saved progress + lifetime stats after mount. localStorage
  // is unavailable during SSR, so this one-time client sync must run in an
  // effect rather than a render-time initializer (which would cause hydration
  // mismatches). Safe from loops: it only re-runs when `dayNumber` changes.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    const saved = loadProgress(dayNumber);
    if (saved) {
      setGuesses(saved.guesses);
      setStatus(saved.status);
    } else {
      setGuesses([]);
      setStatus("playing");
    }
    setStats(loadStats());
    setHydrated(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [dayNumber]);

  const remaining = MAX_GUESSES - guesses.length;
  const wrongGuesses = guesses.filter((g) => !isCorrectGuess(g, puzzle)).length;

  // Hint ladder: map-labels reveal first, then textual hints. Capped at
  // MAX_GUESSES - 1 so no hint is revealed only on the loss screen.
  const hintLadder = useMemo<Hint[]>(
    () =>
      [
        {
          kind: "labels",
          text: "Map labels revealed — place & country names are now shown.",
        } as Hint,
        ...(puzzle.hints ?? []).map((text): Hint => ({ kind: "text", text })),
      ].slice(0, MAX_GUESSES - 1),
    [puzzle.hints],
  );

  const revealedCount = Math.min(wrongGuesses, hintLadder.length);
  const revealedHints = hintLadder.slice(0, revealedCount);
  const showLabels = revealedCount >= 1;
  const hasNextHint =
    status === "playing" && revealedCount < hintLadder.length;

  function handleGuess(name: string) {
    if (status !== "playing" || !hydrated) return;

    const next = [...guesses, name];
    const won = isCorrectGuess(name, puzzle);
    const newStatus: GameStatus = won
      ? "won"
      : next.length >= MAX_GUESSES
        ? "lost"
        : "playing";

    setGuesses(next);
    setStatus(newStatus);
    saveProgress(dayNumber, { guesses: next, status: newStatus });

    if (newStatus !== "playing") {
      // recordResult is idempotent per day (guards on lastCompletedDay).
      setStats(recordResult(dayNumber, won, next.length));
    }
  }

  const finished = status !== "playing";

  return (
    <div className="flex w-full flex-col gap-6">
      <MapPanel
        birth={puzzle.birth}
        death={puzzle.death}
        showLabels={showLabels}
        colorblind={colorblind}
      />

      {revealedHints.length > 0 && (
        <ul className="flex flex-col gap-2">
          {revealedHints.map((hint, i) => (
            <li
              key={i}
              className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100"
            >
              <span aria-hidden>{hint.kind === "labels" ? "🗺️" : "💡"}</span>
              <span>
                <span className="font-medium">Hint {i + 1}:</span> {hint.text}
              </span>
            </li>
          ))}
        </ul>
      )}

      <section className="flex flex-col gap-3">
        {!finished && hydrated && (
          <p className="text-center text-sm text-zinc-500">
            {remaining} {remaining === 1 ? "guess" : "guesses"} left
            {hasNextHint ? " · a wrong guess reveals a hint" : ""}
          </p>
        )}

        {guesses.length > 0 && (
          <ul className="flex flex-col gap-2">
            {guesses.map((g, i) => {
              const correct = isCorrectGuess(g, puzzle);
              return (
                <li
                  key={`${g}-${i}`}
                  className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${
                    correct
                      ? "border-green-300 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200"
                      : "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
                  }`}
                >
                  <span>{g}</span>
                  <span aria-hidden>{correct ? "✓" : "✕"}</span>
                </li>
              );
            })}
          </ul>
        )}

        {!hydrated ? (
          <p className="text-center text-sm text-zinc-400">Loading…</p>
        ) : !finished ? (
          <GuessInput candidates={candidates} onSubmit={handleGuess} />
        ) : (
          <div
            className={`flex flex-col gap-4 rounded-xl border p-4 ${
              status === "won"
                ? "border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950"
                : "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950"
            }`}
          >
            <div className="text-center">
              <p className="text-base font-semibold">
                {status === "won"
                  ? `Correct in ${guesses.length}/${MAX_GUESSES}! 🎉`
                  : "Out of guesses"}
              </p>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                The answer was{" "}
                <span className="font-medium">{puzzle.answer}</span>.
              </p>
            </div>

            {stats && (
              <StatsPanel
                stats={stats}
                highlightGuess={status === "won" ? guesses.length : undefined}
              />
            )}

            <ShareButton
              text={buildShareText({
                dayNumber,
                guesses,
                status,
                puzzle,
                palette: colorblind ? "colorblind" : "default",
                url:
                  typeof window !== "undefined"
                    ? window.location.origin
                    : undefined,
              })}
            />

            <Countdown />
          </div>
        )}
      </section>
    </div>
  );
}
