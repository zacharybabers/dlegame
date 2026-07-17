// born2die — entry sync engine (P0)
//
// The single, OFFLINE (no-network) source of truth for reading and writing the
// game's data files as a consistent set. Both the future CLI (scripts/entry.mjs)
// and the dev-only GUI go through this module so no file ever drifts.
//
// Files it owns:
//   src/data/puzzles.json      the runtime pool; ARRAY ORDER = rotation schedule
//   src/data/names-index.json  autocomplete decoys (answer+aliases must be here)
//   scripts/overrides.json     durable per-QID edits for Wikidata-scanned figures
//   scripts/manual-entries.json  durable hand-authored figures (survive rebuilds)
//
// Formatting is matched to the existing generators exactly so diffs stay clean:
//   puzzles.json / overrides.json / manual-entries.json  -> 2-space + trailing \n
//   names-index.json                                     -> single line, localeCompare sort

import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Resolve the repo root by walking up from CWD to the nearest package.json. This
 * works both for the CLI (run from anywhere in the repo) and when this module is
 * imported by a Next.js route handler (where bundling makes import.meta.url
 * unreliable, but process.cwd() is the project root). Falls back to import.meta
 * dir math if no package.json is found.
 */
function findRepoRoot() {
  let dir = process.cwd();
  while (true) {
    if (existsSync(join(dir, "package.json"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return join(dirname(fileURLToPath(import.meta.url)), "..", "..");
}

const REPO = findRepoRoot();
const SCRIPTS = join(REPO, "scripts");

export const PATHS = {
  puzzles: join(REPO, "src", "data", "puzzles.json"),
  names: join(REPO, "src", "data", "names-index.json"),
  overrides: join(SCRIPTS, "overrides.json"),
  manual: join(SCRIPTS, "manual-entries.json"),
};

// Birth/death closer than this (km) makes a weak puzzle. Mirrors build-data.mjs.
export const SAME_PLACE_KM = 25;
// The game reveals up to 3 textual hints (after the map-labels reveal).
export const RECOMMENDED_HINTS = 3;

// --- low-level IO -----------------------------------------------------------

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT" && fallback !== undefined) return fallback;
    throw err;
  }
}

/** Atomic write: temp file + rename, so a crash never leaves a half-written file. */
async function atomicWrite(path, text) {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}`;
  await writeFile(tmp, text, "utf8");
  await rename(tmp, path);
}

const writePretty = (path, value) =>
  atomicWrite(path, JSON.stringify(value, null, 2) + "\n");
/** names-index format: compact single line, matching build-names.mjs. */
const writeCompact = (path, value) =>
  atomicWrite(path, JSON.stringify(value, null, 0) + "\n");

// --- loaders / savers -------------------------------------------------------

export const loadPool = () => readJson(PATHS.puzzles, []);
export const savePool = (pool) => writePretty(PATHS.puzzles, pool);

export const loadNames = () => readJson(PATHS.names, []);

export const loadManual = () => readJson(PATHS.manual, []);
export const saveManual = (entries) => writePretty(PATHS.manual, entries);

export const loadOverrides = () => readJson(PATHS.overrides, {});
export const saveOverrides = (obj) => writePretty(PATHS.overrides, obj);

// --- helpers ----------------------------------------------------------------

export function slugify(name) {
  return String(name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const formatYear = (year) =>
  year < 0 ? `${Math.abs(year)} BC` : String(year);

function haversineKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** A hand-authored entry has no real Wikidata QID (Q<number>). */
export const isManual = (entry) => !/^Q\d+$/.test(entry?.qid ?? "");

/** Only the game-relevant fields; metadata (fame/difficulty/needsReview) is regenerated. */
const GAME_FIELDS = ["answer", "aliases", "hints", "birth", "death"];

// --- validation -------------------------------------------------------------

function isMarker(m) {
  return (
    m &&
    Number.isFinite(m.lat) &&
    Number.isFinite(m.lng) &&
    Number.isFinite(m.year) &&
    typeof m.place === "string" &&
    m.place.trim() !== ""
  );
}

/**
 * Returns { errors: string[], warnings: string[] }. Save should be blocked on
 * any error; warnings are advisory. `pool` is used for uniqueness checks;
 * `selfId` excludes the entry being edited from those checks.
 */
export function validateEntry(entry, pool = [], selfId = null) {
  const errors = [];
  const warnings = [];

  if (!entry || typeof entry.answer !== "string" || entry.answer.trim() === "")
    errors.push("answer is required");

  for (const [name, m] of [["birth", entry?.birth], ["death", entry?.death]]) {
    if (!isMarker(m)) {
      errors.push(`${name} needs numeric lat/lng/year and a non-empty place`);
      continue;
    }
    if (m.lat < -90 || m.lat > 90) errors.push(`${name}.lat out of range [-90,90]`);
    if (m.lng < -180 || m.lng > 180) errors.push(`${name}.lng out of range [-180,180]`);
  }

  if (isMarker(entry?.birth) && isMarker(entry?.death)) {
    if (entry.birth.year > entry.death.year)
      errors.push("birth year is after death year");
    if (haversineKm(entry.birth, entry.death) < SAME_PLACE_KM)
      warnings.push(`birth and death are < ${SAME_PLACE_KM} km apart (weak puzzle)`);
  }

  const hints = entry?.hints ?? [];
  if (!Array.isArray(hints) || hints.some((h) => typeof h !== "string"))
    errors.push("hints must be an array of strings");
  else if (hints.length < RECOMMENDED_HINTS)
    warnings.push(`only ${hints.length} hint(s); ${RECOMMENDED_HINTS} recommended`);

  // Hints shouldn't leak a token of the answer.
  if (typeof entry?.answer === "string") {
    const tokens = entry.answer
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length >= 4);
    for (const [i, h] of hints.entries()) {
      const hl = String(h).toLowerCase();
      if (tokens.some((t) => hl.includes(t)))
        warnings.push(`hint ${i + 1} may leak the answer`);
    }
  }

  // Uniqueness (id + answer) against the rest of the pool.
  const id = entry?.id ?? slugify(entry?.answer ?? "");
  for (const p of pool) {
    if (p.id === selfId) continue;
    if (p.id === id) errors.push(`duplicate id "${id}"`);
    if (typeof entry?.answer === "string" && p.answer === entry.answer && p.id !== selfId)
      warnings.push(`another entry has the same answer "${entry.answer}"`);
  }

  return { errors, warnings };
}

// --- names-index sync (offline) --------------------------------------------

/**
 * Ensures every pool entry's answer + aliases exist in names-index.json, then
 * writes it back in the canonical (sorted, single-line) format. Purely local —
 * never re-scans Wikidata. Returns the number of names added.
 */
export async function syncNamesIndex(pool) {
  const names = new Set(await loadNames());
  let added = 0;
  for (const p of pool) {
    for (const n of [p.answer, ...(p.aliases ?? [])]) {
      if (n && !names.has(n)) {
        names.add(n);
        added++;
      }
    }
  }
  const sorted = [...names].sort((a, b) => a.localeCompare(b));
  await writeCompact(PATHS.names, sorted);
  return added;
}

// --- durable-edit routing ---------------------------------------------------

/** Record a scanned figure's edited game fields into overrides.json (full objects). */
async function recordOverride(entry, fields = GAME_FIELDS) {
  const overrides = await loadOverrides();
  const prev = overrides[entry.qid] ?? {};
  const next = { ...prev };
  for (const f of fields) {
    if (GAME_FIELDS.includes(f) && entry[f] !== undefined) next[f] = entry[f];
  }
  overrides[entry.qid] = next;
  await saveOverrides(overrides);
}

/** Upsert a hand-authored figure into manual-entries.json (keyed by id). */
async function recordManual(entry) {
  const manual = await loadManual();
  const idx = manual.findIndex((m) => m.id === entry.id);
  if (idx >= 0) manual[idx] = entry;
  else manual.push(entry);
  await saveManual(manual);
}

// --- public mutations -------------------------------------------------------

/** Build a normalized pool record (fills id; keeps metadata if present). */
export function normalizeEntry(entry) {
  const id = entry.id || slugify(entry.answer);
  return {
    id,
    qid: entry.qid ?? `manual:${id}`,
    answer: entry.answer,
    aliases: entry.aliases ?? [],
    hints: entry.hints ?? [],
    birth: entry.birth,
    death: entry.death,
    ...(entry.fame !== undefined ? { fame: entry.fame } : {}),
    ...(entry.difficulty !== undefined ? { difficulty: entry.difficulty } : {}),
    needsReview: false,
  };
}

/**
 * Add or edit an entry, then re-sync every file. `opts.position` (0-based) sets
 * where a NEW entry lands in the schedule (default: end). `opts.changedFields`
 * limits which fields are written to overrides.json when editing a scanned
 * figure (default: all game fields). Throws on validation errors. Returns
 * { entry, warnings, namesAdded, created }.
 */
export async function upsertEntry(input, opts = {}) {
  const pool = await loadPool();
  const entry = normalizeEntry(input);
  const existingIdx = pool.findIndex((p) => p.id === entry.id);

  const { errors, warnings } = validateEntry(
    entry,
    pool,
    existingIdx >= 0 ? entry.id : null,
  );
  if (errors.length)
    throw new Error(`Cannot save "${entry.answer}":\n  - ${errors.join("\n  - ")}`);

  const created = existingIdx < 0;
  if (created) {
    const pos =
      Number.isInteger(opts.position) && opts.position >= 0
        ? Math.min(opts.position, pool.length)
        : pool.length;
    pool.splice(pos, 0, entry);
  } else {
    pool[existingIdx] = { ...pool[existingIdx], ...entry };
  }

  await savePool(pool);
  if (isManual(entry)) await recordManual(entry);
  else await recordOverride(entry, opts.changedFields);
  const namesAdded = await syncNamesIndex(pool);

  return { entry, warnings, namesAdded, created };
}

/** Reorder the whole pool to match `orderedIds` (must be a permutation). */
export async function reorder(orderedIds) {
  const pool = await loadPool();
  const byId = new Map(pool.map((p) => [p.id, p]));
  if (
    orderedIds.length !== pool.length ||
    orderedIds.some((id) => !byId.has(id))
  )
    throw new Error("reorder(): orderedIds must be a permutation of existing ids");
  await savePool(orderedIds.map((id) => byId.get(id)));
}

/** Move one entry to a 0-based schedule position, shifting the rest. */
export async function moveEntry(id, position) {
  const pool = await loadPool();
  const from = pool.findIndex((p) => p.id === id);
  if (from < 0) throw new Error(`moveEntry(): no entry with id "${id}"`);
  const [item] = pool.splice(from, 1);
  const to = Math.max(0, Math.min(position, pool.length));
  pool.splice(to, 0, item);
  await savePool(pool);
  return { id, to };
}

/** Exclude a Wikidata-scanned figure (overrides exclude) and drop it from the pool. */
export async function excludeEntry(qid) {
  const overrides = await loadOverrides();
  overrides[qid] = { ...(overrides[qid] ?? {}), exclude: true };
  await saveOverrides(overrides);
  const pool = await loadPool();
  await savePool(pool.filter((p) => p.qid !== qid));
}

/**
 * Re-sync derived files from the current pool without editing any entry: pushes
 * answer/aliases into names-index. Returns { namesAdded, issues }.
 */
export async function syncAll() {
  const pool = await loadPool();
  const namesAdded = await syncNamesIndex(pool);
  const issues = [];
  for (const p of pool) {
    const { errors, warnings } = validateEntry(pool.length ? p : p, pool, p.id);
    for (const e of errors) issues.push({ id: p.id, level: "error", msg: e });
    for (const w of warnings) issues.push({ id: p.id, level: "warn", msg: w });
  }
  return { namesAdded, issues, count: pool.length };
}
