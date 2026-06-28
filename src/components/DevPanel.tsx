"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { clearProgress, clearStats } from "@/lib/stats";

type PoolItem = { index: number; answer: string };

export default function DevPanel({
  dayNumber,
  answer,
  poolSize,
  pool,
}: {
  dayNumber: number;
  answer: string;
  poolSize: number;
  pool: PoolItem[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(true);

  const go = (day: number) => router.push(`/?day=${day}`);
  const reset = () => router.push("/");
  const wipeProgress = () => {
    clearProgress(dayNumber);
    window.location.reload();
  };
  const wipeStats = () => {
    clearStats();
    window.location.reload();
  };

  const puzzleIndex = ((dayNumber % poolSize) + poolSize) % poolSize;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-3 left-3 z-[2000] rounded-full bg-fuchsia-600 px-3 py-1 text-xs font-bold text-white shadow-lg"
      >
        DEV
      </button>
    );
  }

  return (
    <div className="fixed bottom-3 left-3 z-[2000] w-64 rounded-lg border border-fuchsia-300 bg-white/95 p-3 text-xs shadow-xl backdrop-blur dark:border-fuchsia-700 dark:bg-zinc-900/95">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-bold uppercase tracking-wide text-fuchsia-600">
          Dev tools
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded px-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
        >
          ✕
        </button>
      </div>

      <p className="mb-2 leading-tight text-zinc-600 dark:text-zinc-400">
        Day <span className="font-mono font-semibold">#{dayNumber}</span> · idx{" "}
        {puzzleIndex}
        <br />
        Answer: <span className="font-medium">{answer}</span>
      </p>

      <div className="mb-2 flex gap-1">
        <button
          type="button"
          onClick={() => go(dayNumber - 1)}
          className="flex-1 rounded bg-zinc-200 px-2 py-1 font-medium hover:bg-zinc-300 dark:bg-zinc-700 dark:hover:bg-zinc-600"
        >
          ◀ Prev
        </button>
        <button
          type="button"
          onClick={() => go(dayNumber + 1)}
          className="flex-1 rounded bg-zinc-200 px-2 py-1 font-medium hover:bg-zinc-300 dark:bg-zinc-700 dark:hover:bg-zinc-600"
        >
          Next ▶
        </button>
      </div>

      <label className="mb-2 block">
        <span className="text-zinc-500">Jump to puzzle</span>
        <select
          value={puzzleIndex}
          onChange={(e) => go(Number(e.target.value))}
          className="mt-1 w-full rounded border border-zinc-300 bg-white px-1 py-1 dark:border-zinc-700 dark:bg-zinc-800"
        >
          {pool.map((p) => (
            <option key={p.index} value={p.index}>
              {p.index}: {p.answer}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={reset}
          className="rounded bg-fuchsia-100 px-2 py-1 font-medium text-fuchsia-800 hover:bg-fuchsia-200 dark:bg-fuchsia-950 dark:text-fuchsia-200"
        >
          Reset to today
        </button>
        <button
          type="button"
          onClick={wipeProgress}
          className="rounded bg-amber-100 px-2 py-1 font-medium text-amber-800 hover:bg-amber-200 dark:bg-amber-950 dark:text-amber-200"
        >
          Clear this day&apos;s progress
        </button>
        <button
          type="button"
          onClick={wipeStats}
          className="rounded bg-red-100 px-2 py-1 font-medium text-red-800 hover:bg-red-200 dark:bg-red-950 dark:text-red-200"
        >
          Clear all stats
        </button>
      </div>
    </div>
  );
}
