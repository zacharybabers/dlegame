"use client";

import { MAX_GUESSES } from "@/lib/constants";
import type { Stats } from "@/lib/stats";

function StatBox({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-2xl font-bold tabular-nums">{value}</span>
      <span className="text-[11px] uppercase tracking-wide text-zinc-500">
        {label}
      </span>
    </div>
  );
}

export default function StatsPanel({
  stats,
  highlightGuess,
}: {
  stats: Stats;
  /** Winning guess count for the just-finished game, to highlight its bar. */
  highlightGuess?: number;
}) {
  const winPct = stats.played > 0 ? Math.round((stats.wins / stats.played) * 100) : 0;
  const maxBar = Math.max(1, ...Object.values(stats.distribution));

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-4 gap-2">
        <StatBox label="Played" value={stats.played} />
        <StatBox label="Win %" value={winPct} />
        <StatBox label="Streak" value={stats.currentStreak} />
        <StatBox label="Max" value={stats.maxStreak} />
      </div>

      <div>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Guess distribution
        </h3>
        <ul className="flex flex-col gap-1">
          {Array.from({ length: MAX_GUESSES }, (_, i) => i + 1).map((n) => {
            const count = stats.distribution[n] ?? 0;
            const widthPct = Math.round((count / maxBar) * 100);
            const isHighlight = n === highlightGuess;
            return (
              <li key={n} className="flex items-center gap-2 text-sm">
                <span className="w-3 tabular-nums text-zinc-500">{n}</span>
                <div className="flex-1">
                  <div
                    className={`flex justify-end rounded px-2 py-0.5 text-xs font-medium text-white ${
                      isHighlight ? "bg-green-600" : "bg-zinc-400 dark:bg-zinc-600"
                    }`}
                    style={{ width: `${Math.max(widthPct, count > 0 ? 12 : 8)}%` }}
                  >
                    {count}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
