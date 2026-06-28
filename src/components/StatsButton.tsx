"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import StatsPanel from "@/components/StatsPanel";
import Countdown from "@/components/Countdown";
import { loadStats, type Stats } from "@/lib/stats";

/**
 * Header button (📊) that opens lifetime stats in the modal at any time — not
 * just on the end screen. Reads the latest stats from localStorage each time it
 * opens, so a game finished this session is reflected immediately.
 */
export default function StatsButton() {
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);

  function openModal() {
    setStats(loadStats());
    setOpen(true);
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        aria-label="Statistics"
        title="Statistics"
        className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-300 text-base text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
      >
        <span aria-hidden>📊</span>
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Statistics">
        {stats && stats.played > 0 ? (
          <div className="flex flex-col gap-4">
            <StatsPanel stats={stats} />
            <Countdown />
          </div>
        ) : (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            No games played yet. Solve today&apos;s puzzle to start your streak!
          </p>
        )}
      </Modal>
    </>
  );
}
