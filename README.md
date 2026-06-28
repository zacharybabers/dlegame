# born2die

A daily browser game (Wordle-style). Each day you see a world map with two
markers — a historical figure's **birthplace** (with birth year) and **place of
death** (with death year) — and you have a limited number of guesses to name the
person. After each wrong guess a progressive hint is revealed.

Built with Next.js 16 (App Router, Turbopack) + TypeScript + Tailwind + Leaflet.

## Getting Started

> **Note:** on this machine Node.js is installed at `C:\Program Files\nodejs`
> but is **not on PATH**. Prefix commands with:
> `$env:Path = "C:\Program Files\nodejs;" + $env:Path`

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

In development a **Dev Tools** panel (bottom-left) lets you jump between days and
puzzles and clear progress/stats. It is stripped from production builds.

---

## Data pipeline (generating puzzles & answers)

The game's content comes from two generated JSON files, both built from
**Wikidata** by scripts in `scripts/`. You only run these when you want to
refresh or grow the content — at runtime the app just imports the JSON (no live
Wikidata calls).

| File | Built by | What it is |
| --- | --- | --- |
| `src/data/puzzles.json` | `scripts/build-data.mjs` | The **answer pool** — the curated figures eligible to be the daily answer. Full data: coords, years, hints, aliases, difficulty. |
| `src/data/names-index.json` | `scripts/build-names.mjs` | The **autocomplete decoy pool** — a large, looser list of plausible names so the daily answer doesn't stand out. Names only. |
| `scripts/queries/answer-pool.rq` | (hand-written) | The SPARQL query used by `build-data.mjs`. `.rq` is the standard extension for a SPARQL query. |
| `scripts/overrides.json` | (hand-written) | The **curation layer** — per-QID manual fixes (hints, aliases, exclusions) that `build-data.mjs` merges on top of the generated pool so hand-edits survive regeneration. |

### How to regenerate

```powershell
# always set PATH first (see note above)
$env:Path = "C:\Program Files\nodejs;" + $env:Path

# 1. Build the answer pool (puzzles.json). Run this FIRST.
node scripts\build-data.mjs

# 2. Build the decoy name index (names-index.json).
#    Depends on puzzles.json existing (it merges in every answer + aliases).
node scripts\build-names.mjs
```

Order matters: `build-names.mjs` reads `puzzles.json` to guarantee every answer
is selectable in the autocomplete (it prints `Answer coverage: N/N` — this must
be 100%).

### What each script does

**`build-data.mjs` (answer pool)** — two passes:

1. **Pass 1** runs `queries/answer-pool.rq`: deceased humans (`P31=Q5`) that have
   both a birthplace (`P19`) and place of death (`P20`) **with coordinates**
   (`P625`), plus birth/death years and a fame proxy (Wikipedia **sitelink
   count**, `wikibase:sitelinks`). Ordered by fame.
2. **Filtering:** dedupe by QID; drop blocklisted figures; drop figures whose
   English label didn't resolve; drop **same-place** figures (birth/death within
   `SAME_PLACE_KM`, default 25 km — two overlapping pins make a weak puzzle).
   Keep the top `TARGET_POOL` (default 60) by fame.
3. **Pass 2** uses the Wikidata **action API** (`wbgetentities`) to fetch each
   selected figure's occupations (`P106`), positions held (`P39`), aliases, and
   description **in declared order** — then maps them to the hint ladder.

**`build-names.mjs` (decoy pool)** — one bounded QID-only scan of deceased humans
with `sitelinks >= FAME_FLOOR` (default 65), capped at `MAX_NAMES`, then resolves
labels via batched `wbgetentities`, then merges in every answer name + alias.

### The hint ladder (and the golden rule)

Hints are built in `buildHints()` in `build-data.mjs`:

1. **Domain** — broad field, e.g. *"A figure in science."*
2. **Role** — the figure's primary occupation, e.g. *"Physicist."*
3. **Notable detail** — a notable position held (e.g. *"President of South
   Africa."*) if available, otherwise the (date-stripped) Wikidata description.

> **GOLDEN RULE: a hint must never restate something already visible on the map.**
> The birth/death **years** and birthplace (hence **nationality**) are printed on
> the map, so hints must convey *who* the person was, never *when* or *where*.
> That's why hints come from occupation/position — **never** from dates — and why
> `stripDates()` removes years, ranges, and "Nth-century BCE/AD" phrases from
> descriptions. If you change hint logic, preserve this rule.

### Tuning knobs

| Knob | File | Default | Effect |
| --- | --- | --- | --- |
| Answer-pool fame floor | `queries/answer-pool.rq` (`FILTER(?sitelinks >= …)`) | 120 | Lower → more (less famous, harder) figures in the candidate set. |
| `TARGET_POOL` | `build-data.mjs` | 60 | How many figures to keep in the answer pool. |
| `SAME_PLACE_KM` | `build-data.mjs` | 25 | Min birth↔death distance; below this a figure is dropped. |
| `exclude` in `overrides.json` | `build-data.mjs` **and** `build-names.mjs` | 6 QIDs | Figures excluded entirely (atrocity perpetrators). Single source of truth, shared by both scripts. |
| `DOMAIN_GROUPS` | `build-data.mjs` | — | Occupation → domain/role mapping. Add keys here to classify more occupations. |
| `NOTABLE_POSITION` | `build-data.mjs` | regex | Which `P39` positions qualify as hint #3. |
| `FAME_FLOOR` | `build-names.mjs` | 65 | Min fame for a decoy name. Lower → bigger, noisier decoy pool. |
| `MAX_NAMES` | `build-names.mjs` | 10000 | Hard cap on decoy-pool size (client-side Fuse budget). |

### Reviewing generated answers

`puzzles.json` records carry metadata the game ignores but you should vet:

- `difficulty` (1 = easiest/most famous … 5 = hardest) — used to schedule easy
  figures earlier.
- `needsReview: true` — auto-flagged when the primary occupation was likely
  mis-picked (its description shares no keyword with the chosen domain). **Always
  eyeball these.** Typical causes: polymaths (Leonardo, Galileo — usually fine)
  and figures whose first-listed occupation isn't what they're famous for (e.g.
  Chekhov listed as a physician, Pope Francis as a writer).

Quick review one-liner:

```powershell
node -e "const p=require('./src/data/puzzles.json'); for(const x of p.filter(x=>x.needsReview)) console.log(x.answer,'|',x.hints.join(' / '))"
```

**Preview the upcoming schedule** with the review tool (`scripts/review.mjs`). The
daily puzzle is fully deterministic (`PUZZLES[dayNumber % poolSize]`), so this
prints exactly what the live site will serve, in calendar order, with hints,
difficulty, and `⚠ REVIEW` flags:

```powershell
npm run review                       # next 14 days
node scripts/review.mjs --days 30    # next 30 days
node scripts/review.mjs --flagged    # only needsReview entries (triage)
node scripts/review.mjs --all        # whole pool, in rotation order
```

It's read-only — it never edits the schedule.

### Fixing a bad entry (the overrides layer)

`build-data.mjs` regenerates `puzzles.json` from scratch, so **never hand-edit
`puzzles.json` directly** — your fix would be wiped on the next build. Instead
put fixes in `scripts/overrides.json`, a human curation layer keyed by Wikidata
QID that the build merges on top of each generated record right before writing.

Per-QID keys:

- Any `Puzzle` field (`hints`, `aliases`, `answer`, `birth`, `death`) — replaces
  the generated value. Supplying a field marks the entry human-reviewed
  (`needsReview` → false).
- `exclude: true` — drops the figure from the pool (and from the decoy pool).
  This is the single source of truth for the old hard-coded blocklist.
- `note` — free-text rationale, ignored by the build. A note-only entry just
  marks a figure as reviewed (use it to silence a harmless `needsReview` flag,
  e.g. polymaths like Galileo/Leonardo).
- Keys starting with `_` are ignored (the file's own `_README`).

```jsonc
{
  "Q9215": {                                  // Sigmund Freud
    "hints": ["A figure in science.", "Psychiatrist.",
              "Austrian psychiatrist and founder of psychoanalysis."],
    "note": "Wikidata lists 'essayist' first; he's a psychiatrist."
  },
  "Q352": { "exclude": true, "note": "Adolf Hitler" }
}
```

The build prints how many overrides it applied and **warns about stale
overrides** whose QID never appears in the pool (so the file doesn't rot). If a
fix is something the generator could do correctly for *everyone*, prefer
improving the mapping (`DOMAIN_GROUPS` / `NOTABLE_POSITION`) over a one-off
override.

### Gotchas & learnings (read before editing the scripts)

- **The public Wikidata endpoint is flaky** (`504`, `429`, dropped connections,
  and — worst — **truncated responses**). Both scripts retry with exponential
  backoff.
- **Use CSV, not JSON, for big scans.** A gateway-truncated JSON body breaks
  `JSON.parse` entirely; `build-names.mjs` requests `text/csv` so a cut response
  only drops the last (partial) line. Don't "fix" this back to JSON.
- **Don't put occupations in the Pass-1 SPARQL query.** Occupations multiply rows
  (Einstein has ~14) and reliably time the endpoint out. Fetch them per-figure in
  Pass 2 via the action API instead.
- **Don't fan out into many band queries.** Each band re-scans all deceased
  humans, multiplying load. One bounded scan is gentler on the endpoint.
- **Occupation order matters.** SPARQL `GROUP_CONCAT` scrambles order; the action
  API preserves Wikidata's **declared order**, and we treat the first recognized
  occupation as primary. This is why Pass 2 uses `wbgetentities`.
- **Place labels are hyper-specific** ("Sinking Spring Farm", "Führerbunker").
  That's fine — the map shows the *basemap's* city labels, not our stored place
  name; coordinates still plot correctly.
- **BCE years are negative integers** (e.g. Aristotle `-383`). The UI is
  responsible for "BC" formatting.
- **Heavy usage degrades the endpoint for you specifically.** If everything
  starts 504-ing, wait a few minutes before retrying.

---

## Learn More (Next.js)

- [Next.js Documentation](https://nextjs.org/docs)
- [Learn Next.js](https://nextjs.org/learn)
