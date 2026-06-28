"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import { MAX_GUESSES } from "@/lib/constants";

const SEEN_KEY = "born2die:seen-howto";

/**
 * The "How to play" button (a `?` in the header) plus its modal. Auto-opens
 * once on a visitor's first ever visit (tracked by a localStorage flag), and is
 * reopenable any time via the button.
 */
export default function HowToPlay() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    try {
      if (!window.localStorage.getItem(SEEN_KEY)) setOpen(true);
    } catch {
      /* ignore privacy-mode errors */
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  function close() {
    setOpen(false);
    try {
      window.localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="How to play"
        title="How to play"
        className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-300 text-base font-bold text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
      >
        ?
      </button>

      <Modal open={open} onClose={close} title="How to play">
        <div className="flex flex-col gap-4 text-sm text-zinc-700 dark:text-zinc-300">
          <p>
            A world map marks where a historical figure was{" "}
            <span className="font-semibold text-green-600">born</span> (green pin
            marked “B”, with the year above it) and where they{" "}
            <span className="font-semibold text-red-600">died</span> (red pin
            marked “D”, with the year above it). Guess who they were.
          </p>

          <ul className="flex flex-col gap-2">
            <li className="flex gap-2">
              <span aria-hidden>🎯</span>
              <span>
                You get <span className="font-semibold">{MAX_GUESSES} guesses</span>.
                Start typing a name and pick from the suggestions.
              </span>
            </li>
            <li className="flex gap-2">
              <span aria-hidden>🗺️</span>
              <span>
                The map starts <span className="font-semibold">unlabeled</span> —
                the geography is part of the puzzle. Your first wrong guess
                reveals place and country labels.
              </span>
            </li>
            <li className="flex gap-2">
              <span aria-hidden>💡</span>
              <span>
                Each further wrong guess reveals a text hint. Hints never repeat
                something already on the map (no years, no nationality).
              </span>
            </li>
            <li className="flex gap-2">
              <span aria-hidden>📅</span>
              <span>
                One new puzzle every day at midnight UTC. Come back to keep your
                streak alive!
              </span>
            </li>
          </ul>

          <button
            type="button"
            onClick={close}
            className="mt-1 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Got it
          </button>
        </div>
      </Modal>
    </>
  );
}
