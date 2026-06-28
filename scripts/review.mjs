// born2die — Phase 1e upcoming-entries review tool
//
// Read-only preview of the puzzles that are about to go live, in calendar
// order, so you can vet them (especially `needsReview` entries) before a
// player ever sees them. It changes nothing — fixing a flagged puzzle stays a
// manual edit to src/data/puzzles.json (see README).
//
// The daily puzzle is purely deterministic: getDailyPuzzle = PUZZLES[day % N].
// This script mirrors the epoch + rotation math in src/lib/daily.ts so the
// schedule it prints is exactly what the live site will serve.
//
// Run:
//   node scripts/review.mjs              # next 14 days
//   node scripts/review.mjs --days 30    # next 30 days
//   node scripts/review.mjs --flagged    # only needsReview entries (triage)
//   node scripts/review.mjs --all        # whole pool, in rotation order

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..");
const PUZZLES_PATH = join(REPO, "src", "data", "puzzles.json");

// Keep in sync with src/lib/daily.ts
const EPOCH_UTC = Date.UTC(2024, 0, 1);
const MS_PER_DAY = 86_400_000;

const getDayNumber = (now = Date.now()) =>
  Math.floor((now - EPOCH_UTC) / MS_PER_DAY);

/** Maps a day number to its index in the rotation (safe for negatives). */
const rotationIndex = (dayNumber, n) => ((dayNumber % n) + n) % n;

/** UTC calendar date (YYYY-MM-DD, Sat/Sun…) for a given day number. */
function dateForDay(dayNumber) {
  const d = new Date(EPOCH_UTC + dayNumber * MS_PER_DAY);
  const iso = d.toISOString().slice(0, 10);
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()];
  return `${iso} ${dow}`;
}

/** Years are negative for BCE: -383 -> "384 BC". Mirrors formatYear(). */
const formatYear = (year) => (year < 0 ? `${Math.abs(year)} BC` : String(year));

// --- tiny ANSI helpers (no-op when stdout isn't a TTY) -----------------------
const useColor = process.stdout.isTTY;
const wrap = (code) => (s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const c = {
  bold: wrap("1"),
  dim: wrap("2"),
  red: wrap("31"),
  green: wrap("32"),
  yellow: wrap("33"),
  cyan: wrap("36"),
};

const STARS = (difficulty) =>
  "★".repeat(difficulty) + "·".repeat(Math.max(0, 5 - difficulty));

function parseArgs(argv) {
  const opts = { days: 14, flagged: false, all: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--flagged") opts.flagged = true;
    else if (a === "--all") opts.all = true;
    else if (a === "--days") {
      const n = Number.parseInt(argv[++i], 10);
      if (Number.isFinite(n) && n > 0) opts.days = n;
      else {
        console.error(`--days needs a positive integer (got "${argv[i]}")`);
        process.exit(1);
      }
    } else if (a === "--help" || a === "-h") {
      console.log(
        "Usage: node scripts/review.mjs [--days N] [--flagged] [--all]"
      );
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${a}`);
      process.exit(1);
    }
  }
  return opts;
}

function printEntry({ dayNumber, date, position, puzzle }) {
  const flag = puzzle.needsReview ? c.yellow("⚠ REVIEW") : "        ";
  const diff = c.dim(STARS(puzzle.difficulty ?? 0));
  const head =
    date != null
      ? `${c.cyan(date)}  day#${String(dayNumber).padStart(4)}`
      : `#${String(position).padStart(2)}  day#${String(dayNumber).padStart(4)}`;
  console.log(
    `${head}  ${diff}  ${flag}  ${c.bold(puzzle.answer)}  ${c.dim(
      `(${formatYear(puzzle.birth.year)} ${puzzle.birth.place} → ${formatYear(
        puzzle.death.year
      )} ${puzzle.death.place})`
    )}`
  );
  for (const [i, hint] of (puzzle.hints ?? []).entries()) {
    console.log(`        ${c.dim(`${i + 1}.`)} ${hint}`);
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const puzzles = JSON.parse(await readFile(PUZZLES_PATH, "utf8"));
  const n = puzzles.length;
  if (n === 0) {
    console.error("puzzles.json is empty — run `npm run build:data` first.");
    process.exit(1);
  }

  const today = getDayNumber();

  // Build the list of (dayNumber, puzzle) rows to consider.
  let rows;
  if (opts.all) {
    // Whole pool, in the order it will appear starting from today.
    rows = Array.from({ length: n }, (_, k) => {
      const dayNumber = today + k;
      return {
        dayNumber,
        date: null,
        position: k + 1,
        puzzle: puzzles[rotationIndex(dayNumber, n)],
      };
    });
  } else {
    rows = Array.from({ length: opts.days }, (_, k) => {
      const dayNumber = today + k;
      return {
        dayNumber,
        date: dateForDay(dayNumber),
        position: k + 1,
        puzzle: puzzles[rotationIndex(dayNumber, n)],
      };
    });
  }

  const flaggedCount = rows.filter((r) => r.puzzle.needsReview).length;
  const visible = opts.flagged ? rows.filter((r) => r.puzzle.needsReview) : rows;

  const scope = opts.all
    ? `all ${n} puzzles (rotation order)`
    : `next ${opts.days} day(s)`;
  console.log(
    c.bold(`born2die — upcoming review`) +
      `  ·  today = day#${today}  ·  pool size ${n}`
  );
  console.log(
    `${scope}: ${c.yellow(String(flaggedCount))} flagged ⚠` +
      (opts.flagged ? c.dim("  (showing flagged only)") : "")
  );
  console.log("");

  if (visible.length === 0) {
    console.log(c.green("Nothing to review in this window. ✓"));
    return;
  }

  for (const row of visible) {
    printEntry(row);
    console.log("");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
