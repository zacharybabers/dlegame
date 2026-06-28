"use client";

import { useEffect, useState } from "react";

/**
 * Client-side user settings backed by localStorage. Kept tiny and dependency-
 * free: a custom window event lets every component (map, share text, the header
 * toggle) stay in sync without a React context provider.
 */
const CB_KEY = "born2die:colorblind";
const SETTINGS_EVENT = "born2die:settings-change";

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function getColorblind(): boolean {
  if (!isBrowser()) return false;
  try {
    return window.localStorage.getItem(CB_KEY) === "1";
  } catch {
    return false;
  }
}

export function setColorblind(value: boolean): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(CB_KEY, value ? "1" : "0");
  } catch {
    /* ignore privacy-mode errors */
  }
  window.dispatchEvent(new Event(SETTINGS_EVENT));
}

/**
 * Reactive colorblind-mode hook. Returns the current value (false during SSR /
 * before hydration) and a setter. Stays in sync across components and across
 * tabs via the custom event + the native `storage` event.
 */
export function useColorblind(): [boolean, (value: boolean) => void] {
  const [colorblind, setCb] = useState(false);

  useEffect(() => {
    const sync = () => setCb(getColorblind());
    sync();
    window.addEventListener(SETTINGS_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(SETTINGS_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return [colorblind, setColorblind];
}
