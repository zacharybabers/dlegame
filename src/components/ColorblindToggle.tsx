"use client";

import { useColorblind } from "@/lib/settings";

/**
 * Header toggle for colorblind mode (green/red → blue/orange map markers and
 * share emojis). The B/D pin glyphs remain in both modes; this just swaps the
 * palette for users who prefer the higher-contrast pair.
 */
export default function ColorblindToggle() {
  const [colorblind, setColorblind] = useColorblind();

  return (
    <button
      type="button"
      onClick={() => setColorblind(!colorblind)}
      aria-pressed={colorblind}
      aria-label="Toggle colorblind mode"
      title={colorblind ? "Colorblind mode: on" : "Colorblind mode: off"}
      className={`flex h-9 w-9 items-center justify-center rounded-full border text-base transition-colors ${
        colorblind
          ? "border-blue-500 bg-blue-50 text-blue-600 dark:border-blue-400 dark:bg-blue-950 dark:text-blue-300"
          : "border-zinc-300 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
      }`}
    >
      <span aria-hidden>◑</span>
    </button>
  );
}
