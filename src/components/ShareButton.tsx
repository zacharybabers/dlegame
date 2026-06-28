"use client";

import { useState } from "react";

type ShareState = "idle" | "copied" | "error";

/** Best-effort clipboard write with a legacy fallback for insecure contexts. */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to legacy path */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/**
 * Share button for the end screen. Prefers the native share sheet (mobile);
 * otherwise copies the result to the clipboard and shows transient feedback.
 */
export default function ShareButton({ text }: { text: string }) {
  const [state, setState] = useState<ShareState>("idle");

  function flash(next: ShareState) {
    setState(next);
    window.setTimeout(() => setState("idle"), 2000);
  }

  async function handleShare() {
    // Native share sheet first, when available.
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch (err) {
        // User dismissed the sheet — don't fall back to a surprise copy.
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Otherwise (unsupported payload, etc.) fall through to clipboard.
      }
    }
    flash((await copyToClipboard(text)) ? "copied" : "error");
  }

  const label =
    state === "copied"
      ? "Copied to clipboard!"
      : state === "error"
        ? "Couldn't copy — copy manually"
        : "Share result";

  return (
    <button
      type="button"
      onClick={handleShare}
      aria-live="polite"
      className="mx-auto flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-400"
    >
      <span aria-hidden>{state === "copied" ? "✓" : "📋"}</span>
      {label}
    </button>
  );
}
