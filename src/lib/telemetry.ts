/**
 * Fire-and-forget global telemetry: reports the outcome of a finished game to
 * /api/result so we can aggregate per-day guess distributions. Reports at most
 * once per day per browser (localStorage guard) and never throws — a missed
 * stat is harmless and must not affect gameplay.
 */
const reportedKey = (day: number) => `born2die:reported:${day}`;

export function reportResult(day: number, won: boolean, guessCount: number): void {
  if (typeof window === "undefined") return;
  try {
    if (localStorage.getItem(reportedKey(day))) return;
    localStorage.setItem(reportedKey(day), "1");
  } catch {
    // localStorage unavailable: still try once, just no dedupe.
  }
  const bucket = won ? String(guessCount) : "X";
  void fetch("/api/result", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ day, bucket }),
    keepalive: true,
  }).catch(() => {});
}
