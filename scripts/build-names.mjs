// born2die — Phase 1c names-index builder
//
// Generates src/data/names-index.json: a large pool of plausible historical-
// figure names that powers the guess autocomplete. Its only job is to provide
// DECOYS so the daily answer doesn't stand out as "the only famous name". It is
// a much larger, looser superset of the answer pool (puzzles.json) and needs
// only names — no coords/years/hints.
//
// Run:  node scripts/build-names.mjs
//
// Why bands instead of one big query: a single "ORDER BY sitelinks DESC LIMIT
// 6000" took ~58s — right at the public endpoint's 60s timeout. Fetching in
// descending fame BANDS keeps every query small and fast, then we merge+dedupe.

import { writeFile, mkdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..");
const PUZZLES_FILE = join(REPO, "src", "data", "puzzles.json");
const OVERRIDES_FILE = join(__dirname, "overrides.json");
const OUT_FILE = join(REPO, "src", "data", "names-index.json");

const ENDPOINT = "https://query.wikidata.org/sparql";
const USER_AGENT = "born2die-datapipeline/0.1 (contact: dev@example.com)";

// One bounded QID-only scan. Threshold keeps the pool to plausible (famous-ish)
// deceased figures; LIMIT caps total size. A SINGLE scan is far easier on the
// public endpoint than many band queries (each band re-scans all deceased
// humans). Labels are resolved afterwards via batched wbgetentities.
const FAME_FLOOR = 65; // min Wikipedia sitelinks to be a plausible decoy
const MAX_NAMES = 10000; // cap on decoy-pool size (client-side Fuse budget)

// Don't offer excluded figures (atrocity perpetrators) even as decoys. The
// exclusion list is the single source of truth in scripts/overrides.json
// (entries with "exclude": true), shared with build-data.mjs.
async function loadExclusions() {
  try {
    const raw = JSON.parse(await readFile(OVERRIDES_FILE, "utf8"));
    return new Set(
      Object.entries(raw)
        .filter(([qid, o]) => !qid.startsWith("_") && o.exclude)
        .map(([qid]) => qid),
    );
  } catch (err) {
    if (err.code === "ENOENT") return new Set();
    throw err;
  }
}

/**
 * Scan QIDs via SPARQL CSV output. CSV is line-based, so a gateway-truncated
 * response just drops the last (partial) line instead of failing the whole
 * parse the way JSON.parse does. Returns an array of entity QIDs.
 */
async function scanQids(query, label) {
  const body = new URLSearchParams({ query }).toString();
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "text/csv",
          "User-Agent": USER_AGENT,
        },
        body,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
      lines.shift(); // drop CSV header ("person")
      const ids = [];
      for (const line of lines) {
        const m = /Q\d+$/.exec(line); // tolerate quotes / partial lines
        if (m) ids.push(m[0]);
      }
      return ids;
    } catch (err) {
      const wait = Math.min(2 ** attempt, 30) * 1000;
      console.warn(`  [${label}] attempt ${attempt}/6 failed: ${err.message}; retry in ${wait / 1000}s`);
      if (attempt === 6) throw err;
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

const WD_API = "https://www.wikidata.org/w/api.php";

/** Batched wbgetentities label resolution. Returns { qid: enLabel }. */
async function resolveLabels(ids) {
  const out = {};
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const url =
      `${WD_API}?action=wbgetentities&format=json&languages=en` +
      `&props=labels&ids=${batch.join("|")}`;
    let ok = false;
    for (let attempt = 1; attempt <= 6 && !ok; attempt++) {
      try {
        const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (json.error) throw new Error(json.error.info);
        for (const [id, ent] of Object.entries(json.entities)) {
          const label = ent?.labels?.en?.value;
          if (label) out[id] = label;
        }
        ok = true;
      } catch (err) {
        const wait = Math.min(2 ** attempt, 30) * 1000;
        console.warn(`  [labels] batch ${i / 50 + 1} attempt ${attempt}: ${err.message}; retry ${wait / 1000}s`);
        if (attempt === 6) throw err;
        await new Promise((r) => setTimeout(r, wait));
      }
    }
    if ((i / 50) % 20 === 0) console.log(`  ...resolved ${Math.min(i + 50, ids.length)}/${ids.length} labels`);
  }
  return out;
}

async function main() {
  const excluded = await loadExclusions();
  console.log(
    `Scanning deceased humans with sitelinks >= ${FAME_FLOOR} (QIDs only)...`,
  );
  // QID-only, no label service, no ORDER BY: the planner streams matches until
  // LIMIT, which avoids the costly full sort that nearly timed out earlier.
  const query = `
SELECT ?person WHERE {
  ?person wdt:P31 wd:Q5 ; wdt:P570 ?d ; wikibase:sitelinks ?s .
  FILTER(?s >= ${FAME_FLOOR})
}
LIMIT ${MAX_NAMES}`;
  const ids = new Set();
  for (const id of await scanQids(query, "scan")) {
    if (!excluded.has(id)) ids.add(id);
  }
  console.log(`  -> ${ids.size} unique QIDs`);
  if (ids.size >= MAX_NAMES) {
    console.warn(`  ! hit the ${MAX_NAMES} cap — raise FAME_FLOOR or MAX_NAMES for more`);
  }

  console.log(`Resolving ${ids.size} labels via wbgetentities...`);
  const labels = await resolveLabels([...ids]);
  const names = new Set();
  for (const id of ids) {
    const name = labels[id];
    if (name && !/^Q\d+$/.test(name)) names.add(name);
  }
  console.log(`  ${names.size} names resolved`);

  // Guarantee every answer-pool figure (name + aliases) is selectable.
  const puzzles = JSON.parse(await readFile(PUZZLES_FILE, "utf8"));
  let answerAdds = 0;
  for (const p of puzzles) {
    for (const n of [p.answer, ...(p.aliases ?? [])]) {
      if (n && !names.has(n)) {
        names.add(n);
        answerAdds++;
      }
    }
  }
  console.log(`Merged answer pool: +${answerAdds} names/aliases not already present`);

  const sorted = [...names].sort((a, b) => a.localeCompare(b));
  await mkdir(dirname(OUT_FILE), { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(sorted, null, 0) + "\n", "utf8");

  console.log(`\nWrote ${sorted.length} names to ${OUT_FILE}`);
  const missing = puzzles.filter((p) => !names.has(p.answer)).map((p) => p.answer);
  console.log(`Answer coverage: ${puzzles.length - missing.length}/${puzzles.length}`);
  if (missing.length) console.warn("  MISSING answers:", missing.join(", "));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
