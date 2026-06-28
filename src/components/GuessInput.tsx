"use client";

import { useMemo, useRef, useState } from "react";
import Fuse from "fuse.js";

export default function GuessInput({
  candidates,
  disabled = false,
  onSubmit,
}: {
  candidates: string[];
  disabled?: boolean;
  onSubmit: (name: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Build the fuzzy index once per candidate list.
  const fuse = useMemo(
    () => new Fuse(candidates, { threshold: 0.4, ignoreLocation: true }),
    [candidates],
  );

  const suggestions = useMemo(() => {
    const q = query.trim();
    if (!q) return [];
    return fuse.search(q, { limit: 6 }).map((r) => r.item);
  }, [fuse, query]);

  function commit(name: string) {
    const value = name.trim();
    if (!value) return;
    onSubmit(value);
    setQuery("");
    setOpen(false);
    setHighlight(0);
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) {
      if (e.key === "Enter") commit(query);
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlight((h) => (h + 1) % suggestions.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length);
        break;
      case "Enter":
        e.preventDefault();
        commit(suggestions[highlight] ?? query);
        break;
      case "Escape":
        setOpen(false);
        break;
    }
  }

  return (
    <div className="relative w-full">
      <div className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={query}
          disabled={disabled}
          placeholder="Guess the historical figure…"
          autoComplete="off"
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setHighlight(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={handleKeyDown}
          className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button
          type="button"
          disabled={disabled || !query.trim()}
          onClick={() => commit(query)}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Guess
        </button>
      </div>

      {open && suggestions.length > 0 && (
        <ul className="absolute z-[1000] mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          {suggestions.map((name, i) => (
            <li key={name}>
              <button
                type="button"
                // onMouseDown (not onClick) fires before the input's onBlur
                onMouseDown={(e) => {
                  e.preventDefault();
                  commit(name);
                }}
                onMouseEnter={() => setHighlight(i)}
                className={`block w-full px-3 py-2 text-left text-sm ${
                  i === highlight
                    ? "bg-zinc-100 dark:bg-zinc-800"
                    : "bg-transparent"
                }`}
              >
                {name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
