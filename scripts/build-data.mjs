// born2die — Phase 1b data pipeline
//
// Generates src/data/puzzles.json (the curated daily answer pool) from Wikidata.
//
// Run:  node scripts/build-data.mjs
// (Requires Node 18+ for global fetch. We use Node 24. No npm deps.)
//
// Two-pass design:
//   Pass 1: scripts/queries/answer-pool.rq -> candidate people (coords, years, fame).
//           Occupation is intentionally NOT in this query (it multiplies rows and
//           times out the public endpoint).
//   Pass 2: a light follow-up query over ONLY the selected QIDs to fetch
//           occupations (P106), positions held (P39), aliases, and descriptions.
//
// Between the passes we dedupe, drop "same-place" figures (birth/death within
// ~25 km), drop blocklisted figures, take the top N by fame, then build hints.
//
// HINT RULE (locked in plan.md): hints describe WHO the person was (field, role,
// deeds) — never WHEN. The birth/death years are already printed on the map, so
// date- or era-derived hints are redundant. We therefore build hints from
// occupation/position and strip date parentheticals out of descriptions.

import { writeFile, mkdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..");
const QUERY_FILE = join(__dirname, "queries", "answer-pool.rq");
const OVERRIDES_FILE = join(__dirname, "overrides.json");
const OUT_FILE = join(REPO, "src", "data", "puzzles.json");

const ENDPOINT = "https://query.wikidata.org/sparql";
const USER_AGENT = "born2die-datapipeline/0.1 (contact: dev@example.com)";

/** How many curated figures to keep after filtering. "Start small." */
const TARGET_POOL = 60;
/** Birth/death closer than this (km) = "same place" -> excluded (weak puzzle). */
const SAME_PLACE_KM = 25;

/**
 * Human curation layer (scripts/overrides.json), keyed by QID. Lets hand-fixes
 * survive regeneration: any Puzzle field here is merged on top of the generated
 * record, `exclude: true` drops the figure (the single source of truth for the
 * old BLOCKLIST), and `note` is free-text rationale. Keys starting with "_" are
 * ignored (the file's own _README). See README "Data pipeline" for details.
 */
async function loadOverrides() {
  try {
    const raw = JSON.parse(await readFile(OVERRIDES_FILE, "utf8"));
    const overrides = {};
    for (const [qid, value] of Object.entries(raw)) {
      if (!qid.startsWith("_")) overrides[qid] = value;
    }
    return overrides;
  } catch (err) {
    if (err.code === "ENOENT") {
      console.warn(`  no overrides file at ${OVERRIDES_FILE} (skipping)`);
      return {};
    }
    throw err;
  }
}

// --- SPARQL helpers ---------------------------------------------------------

/** POST a SPARQL query with retry/backoff (the public endpoint 504s/429s a lot). */
async function sparql(query, label) {
  const body = new URLSearchParams({ query }).toString();
  const maxAttempts = 6;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/sparql-results+json",
          "User-Agent": USER_AGENT,
        },
        body,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      return json.results.bindings;
    } catch (err) {
      const wait = Math.min(2 ** attempt, 30) * 1000;
      console.warn(
        `  [${label}] attempt ${attempt}/${maxAttempts} failed: ${err.message}. ` +
          `retrying in ${wait / 1000}s...`,
      );
      if (attempt === maxAttempts) throw err;
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

const WD_API = "https://www.wikidata.org/w/api.php";

/**
 * Batched wbgetentities (action API). Unlike SPARQL GROUP_CONCAT, this preserves
 * claim DECLARED ORDER, which we need to pick a figure's primary occupation.
 * Returns a merged { qid: entity } map.
 */
async function wbgetentities(ids, props) {
  const out = {};
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const url =
      `${WD_API}?action=wbgetentities&format=json&languages=en` +
      `&props=${props}&ids=${batch.join("|")}`;
    let ok = false;
    for (let attempt = 1; attempt <= 6 && !ok; attempt++) {
      try {
        const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (json.error) throw new Error(json.error.info);
        Object.assign(out, json.entities);
        ok = true;
      } catch (err) {
        const wait = Math.min(2 ** attempt, 30) * 1000;
        console.warn(
          `  [wbget] batch ${i / 50 + 1} attempt ${attempt} failed: ${err.message}; ` +
            `retry in ${wait / 1000}s`,
        );
        if (attempt === 6) throw err;
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }
  return out;
}

/** "Point(lng lat)" -> { lat, lng } */
function parsePoint(wkt) {
  const m = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(wkt);
  if (!m) return null;
  return { lng: Number(m[1]), lat: Number(m[2]) };
}

/** QID from a full entity URI. */
function qid(uri) {
  return uri.split("/").pop();
}

/** Great-circle distance in km between two {lat,lng}. */
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

// --- Hint construction ------------------------------------------------------

/**
 * Occupation -> broad-domain bucket, in priority order. The first occupation a
 * figure has that matches one of these groups decides both the domain hint
 * (hint #1) and the role hint (hint #2). Keep the most "iconic" domains first.
 */
// Priority order reflects "what the person is famous FOR" when Wikidata lists
// several unranked occupations. Religion/politics/arts/music/writing come before
// philosophy and science, so e.g. Tolstoy -> writer (not philosopher) and
// Leonardo -> painter (not physicist). Truly ambiguous polymaths still get
// flagged needsReview. Matching is EXACT (no substring) to avoid "songwriter" ->
// "writer" or "general contractor" -> "general".
const DOMAIN_GROUPS = [
  { domain: "A religious figure.", keys: ["prophet", "religious leader", "founder of religion", "pope", "saint", "theologian", "monk", "bishop", "preacher", "minister", "messiah", "rabbi"] },
  { domain: "A political or military leader.", keys: ["monarch", "emperor", "empress", "king", "queen", "head of state", "president", "politician", "statesperson", "stateswoman", "sovereign", "revolutionary", "activist", "military officer", "military personnel", "general", "military leader", "aristocrat", "noble", "diplomat", "lawyer"] },
  { domain: "An artist.", keys: ["painter", "sculptor", "architect", "draughtsperson", "artist", "photographer"] },
  { domain: "A figure in music.", keys: ["composer", "musician", "singer", "singer-songwriter", "songwriter", "pianist", "conductor", "violinist"] },
  { domain: "A writer.", keys: ["writer", "poet", "playwright", "novelist", "author", "journalist", "dramatist", "short story writer", "essayist"] },
  { domain: "A performer or entertainer.", keys: ["actor", "filmmaker", "film director", "screenwriter", "comedian", "dancer"] },
  { domain: "A philosopher.", keys: ["philosopher"] },
  { domain: "An explorer.", keys: ["explorer", "navigator", "astronaut", "seafarer"] },
  { domain: "A figure in science.", keys: ["physicist", "mathematician", "chemist", "biologist", "astronomer", "naturalist", "scientist", "inventor", "engineer", "physician", "psychologist", "computer scientist", "economist"] },
  { domain: "An athlete.", keys: ["athlete", "footballer", "boxer", "association football player"] },
  { domain: "A business figure.", keys: ["entrepreneur", "businessperson", "businessman", "chief executive officer"] },
];

/**
 * Notable leadership positions (P39) worth using as the most-revealing hint #3.
 * Filters out legislative/minor roles like "Member of the Illinois House" that
 * are obscure and sometimes embed dates.
 */
const NOTABLE_POSITION = /\b(king|queen|emperor|empress|tsar|sultan|pharaoh|monarch|president|prime minister|chancellor|pope|first lady|secretary of state|chief justice|dictator|consul|f[üu]hrer|head of state|founder)\b/i;

function titleCase(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Removes dates/eras from a description, e.g. "(1879–1955)", "4th-century BCE". */
function stripDates(desc) {
  return desc
    .replace(/\s*\([^)]*\d[^)]*\)\s*$/g, "") // trailing "(…1879…)"
    .replace(/\b\d{1,2}(st|nd|rd|th)[\s-]century\b/gi, "") // "4th-century"
    .replace(/\b(BCE|CE|BC|AD)\b/g, "") // era abbreviations
    .replace(/,?\s*\b\d{3,4}\s*[–—-]\s*\d{3,4}\b/g, "") // "1879–1955"
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s,]+|[\s,]+$/g, "")
    .trim();
}

/**
 * Builds the hint ladder for one figure:
 *   1. broad domain (field)
 *   2. specific role (primary occupation, title-cased)
 *   3. most notable position held (P39) if any, else the date-stripped description
 * Returns { hints, classified, role, group, usedPosition } so callers can decide
 * whether the figure needs manual review.
 */
function buildHints(occupations, positions, description) {
  // occupations arrive in Wikidata's DECLARED ORDER; the first one we recognize
  // is treated as the primary (editors list the main occupation first).
  let domain = null;
  let role = null;
  let group = null;
  for (const occ of occupations) {
    const g = DOMAIN_GROUPS.find((gr) => gr.keys.includes(occ.toLowerCase()));
    if (g) {
      group = g;
      domain = g.domain;
      role = titleCase(occ);
      break;
    }
  }

  const hints = [];
  if (domain) hints.push(domain);
  if (role) hints.push(`${role}.`);

  // Most revealing hint #3: a NOTABLE position (P39), else a date-stripped
  // description, else nothing (figure ends with 2 hints + needsReview).
  const notable = positions.find((p) => NOTABLE_POSITION.test(p));
  let usedPosition = false;
  if (notable) {
    hints.push(titleCase(notable) + ".");
    usedPosition = true;
  } else if (description) {
    const cleaned = stripDates(description);
    if (cleaned) hints.push(titleCase(cleaned) + ".");
  }

  return { hints, classified: Boolean(domain), role, group, usedPosition };
}

/** "Albert Einstein" -> "albert-einstein" */
function slugify(name) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// --- Main -------------------------------------------------------------------

async function main() {
  const overrides = await loadOverrides();
  const excluded = new Set(
    Object.entries(overrides)
      .filter(([, o]) => o.exclude)
      .map(([q]) => q),
  );
  console.log(
    `Loaded ${Object.keys(overrides).length} overrides ` +
      `(${excluded.size} exclusions)`,
  );

  console.log("Pass 1: querying candidate pool...");
  const query = await readFile(QUERY_FILE, "utf8");
  const rows = await sparql(query, "pool");
  console.log(`  got ${rows.length} rows`);

  // Dedupe by QID; keep the first (highest-fame, query is ordered) occurrence.
  const byId = new Map();
  for (const r of rows) {
    const id = qid(r.person.value);
    if (byId.has(id)) continue;
    const birth = parsePoint(r.bpCoord.value);
    const death = parsePoint(r.dpCoord.value);
    if (!birth || !death) continue;
    byId.set(id, {
      qid: id,
      name: r.personLabel.value,
      fame: Number(r.sitelinks.value),
      birth: { ...birth, year: Number(r.birthYear.value), place: r.bpLabel.value },
      death: { ...death, year: Number(r.deathYear.value), place: r.dpLabel.value },
    });
  }
  console.log(`  ${byId.size} unique people`);

  // Filter: excluded (overrides), missing-label (QID leaked through), same-place.
  const filtered = [];
  let dropBlock = 0,
    dropLabel = 0,
    dropSame = 0;
  for (const p of byId.values()) {
    if (excluded.has(p.qid)) { dropBlock++; continue; }
    if (/^Q\d+$/.test(p.name)) { dropLabel++; continue; } // label didn't resolve
    if (haversineKm(p.birth, p.death) < SAME_PLACE_KM) { dropSame++; continue; }
    filtered.push(p);
  }
  console.log(
    `  filtered: -${dropBlock} blocklist, -${dropLabel} unresolved-label, ` +
      `-${dropSame} same-place -> ${filtered.length} remain`,
  );
  if (dropBlock > 0) console.log(`  (-${dropBlock} were excluded via overrides)`);

  // Keep the top N by fame.
  filtered.sort((a, b) => b.fame - a.fame);
  const selected = filtered.slice(0, TARGET_POOL);
  console.log(`  selected top ${selected.length} by fame`);

  // Pass 2: fetch claims/aliases/descriptions in DECLARED ORDER via the action
  // API (SPARQL GROUP_CONCAT loses occupation order, which we need to identify
  // the PRIMARY occupation). Then resolve occupation/position QIDs to labels.
  console.log("Pass 2: fetching claims (declared order) via wbgetentities...");
  const ids = selected.map((p) => p.qid);
  const entities = await wbgetentities(ids, "claims|aliases|descriptions");

  /** Ordered list of value-QIDs for a property on an entity. */
  const claimIds = (ent, prop) =>
    (ent?.claims?.[prop] ?? [])
      .map((c) => c.mainsnak?.datavalue?.value?.id)
      .filter(Boolean);

  // Gather all occupation (P106) + position (P39) QIDs so we can resolve labels
  // in one batched pass.
  const labelQids = new Set();
  const raw = new Map();
  for (const p of selected) {
    const ent = entities[p.qid];
    const occ = claimIds(ent, "P106");
    const pos = claimIds(ent, "P39");
    occ.forEach((q) => labelQids.add(q));
    pos.forEach((q) => labelQids.add(q));
    raw.set(p.qid, {
      occQids: occ,
      posQids: pos,
      aliases: (ent?.aliases?.en ?? []).map((a) => a.value),
      description: ent?.descriptions?.en?.value ?? "",
    });
  }

  console.log(`  resolving ${labelQids.size} occupation/position labels...`);
  const labelEnts = await wbgetentities([...labelQids], "labels");
  const labelOf = (q) => labelEnts[q]?.labels?.en?.value ?? "";

  const details = new Map();
  for (const p of selected) {
    const r = raw.get(p.qid);
    details.set(p.qid, {
      occupations: r.occQids.map(labelOf).filter(Boolean), // declared order
      positions: r.posQids.map(labelOf).filter(Boolean),
      aliases: r.aliases,
      description: r.description,
    });
  }
  console.log(`  got details for ${details.size} figures`);

  // Assemble final puzzle records (matches the Puzzle type + extra metadata).
  const puzzles = selected.map((p, i) => {
    const d = details.get(p.qid) ?? { occupations: [], positions: [], aliases: [], description: "" };
    const { hints, classified, group, usedPosition } = buildHints(d.occupations, d.positions, d.description);
    // Flag for review only when hint #3 fell back to the description AND that
    // description shares no keyword with the chosen domain — a strong signal the
    // primary occupation was mis-picked (e.g. Chekhov classified "science" but
    // described as "dramatist", Pope Francis "writer" but described as "Pope").
    let needsReview = !classified || hints.length < 3;
    if (!needsReview && !usedPosition && d.description && group) {
      const desc = d.description.toLowerCase();
      const overlap = group.keys.some((k) => desc.includes(k));
      if (!overlap) needsReview = true;
    }
    return {
      id: slugify(p.name),
      qid: p.qid,
      answer: p.name,
      aliases: d.aliases.slice(0, 6),
      hints,
      birth: { lat: p.birth.lat, lng: p.birth.lng, year: p.birth.year, place: p.birth.place },
      death: { lat: p.death.lat, lng: p.death.lng, year: p.death.year, place: p.death.place },
      // --- metadata (ignored by the game; used for scheduling & review) ---
      fame: p.fame,
      difficulty: Math.ceil(((i + 1) / selected.length) * 5), // 1=easiest .. 5=hardest
      needsReview,
    };
  });

  // Apply the human curation layer: deep-merge any per-QID Puzzle fields on top
  // of the generated record. An override that supplies fields means a human has
  // vetted this entry, so its needsReview flag is forced false. Control keys
  // (exclude/note) and the field metadata are not copied into the record.
  const appliedQids = new Set();
  for (const p of puzzles) {
    const o = overrides[p.qid];
    if (!o) continue;
    const fields = { ...o };
    delete fields.exclude;
    delete fields.note;
    if (Object.keys(fields).length > 0) Object.assign(p, fields);
    // Any override (even note-only) means a human has vetted this entry.
    p.needsReview = false;
    appliedQids.add(p.qid);
  }
  console.log(`  applied ${appliedQids.size} override(s)`);

  // Warn about stale overrides whose QID never made it into the pool (excluded
  // entries are expected to be absent and don't count as stale).
  const present = new Set(puzzles.map((p) => p.qid));
  const stale = Object.keys(overrides).filter(
    (q) => !present.has(q) && !overrides[q].exclude,
  );
  if (stale.length > 0) {
    console.warn(
      `  WARNING: ${stale.length} override(s) not in pool (stale?): ${stale.join(", ")}`,
    );
  }

  await mkdir(dirname(OUT_FILE), { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(puzzles, null, 2) + "\n", "utf8");

  const flagged = puzzles.filter((p) => p.needsReview).length;
  console.log(`\nWrote ${puzzles.length} puzzles to ${OUT_FILE}`);
  console.log(`  ${flagged} flagged needsReview (couldn't classify or <3 hints)`);
  console.log("\nSample:");
  for (const p of puzzles.slice(0, 8)) {
    console.log(`  ${p.answer}  [diff ${p.difficulty}]  hints: ${p.hints.join(" / ")}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
