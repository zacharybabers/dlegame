// born2die — entry tool CLI (P1)
//
// A thin, ergonomic wrapper over scripts/lib/entries.mjs. Every mutation goes
// through the sync engine, so puzzles.json, names-index.json, overrides.json and
// manual-entries.json always stay consistent (autocomplete included).
//
// Commands:
//   list [--all]                       show the schedule (array order = rotation)
//   validate                           report validation issues (exit 1 on error)
//   sync                               ensure names-index covers all answers
//   hints <id> --set "h1" "h2" "h3"    replace an entry's textual hints
//   move <id> --to <pos>               move an entry to a 0-based schedule slot
//   exclude <qid>                      drop a scanned figure (overrides exclude)
//   add --json '<obj>' | --file <p>    add a new figure  [--position N]
//   edit <id> --json '<patch>' | --file <p>   merge fields into an entry
//
// Entry/patch JSON shape (birth/death deep-merge on edit):
//   { "answer": "...", "aliases": ["..."], "hints": ["..","..",".."],
//     "birth": { "lat": 0, "lng": 0, "year": 1900, "place": "..." },
//     "death": { "lat": 0, "lng": 0, "year": 1970, "place": "..." } }

import { readFile } from "node:fs/promises";
import {
  loadPool,
  syncAll,
  validateEntry,
  upsertEntry,
  moveEntry,
  excludeEntry,
  formatYear,
  isManual,
} from "./lib/entries.mjs";

const useColor = process.stdout.isTTY;
const c = (code) => (s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const red = c("31");
const yellow = c("33");
const green = c("32");
const cyan = c("36");
const dim = c("2");
const bold = c("1");

function die(msg) {
  console.error(red("error: ") + msg);
  process.exit(1);
}

/** Minimal flag parser: --key val, --key (boolean), and collects --set greedily. */
function parseFlags(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--set") {
      // Greedy: consume everything until the next --flag.
      const rest = [];
      while (i + 1 < argv.length && !argv[i + 1].startsWith("--")) rest.push(argv[++i]);
      flags.set = rest;
    } else if (a.startsWith("--")) {
      const key = a.slice(2);
      if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) flags[key] = argv[++i];
      else flags[key] = true;
    } else {
      positional.push(a);
    }
  }
  return { flags, positional };
}

async function readEntryInput(flags) {
  if (flags.file) return JSON.parse(await readFile(flags.file, "utf8"));
  if (typeof flags.json === "string") return JSON.parse(flags.json);
  die("provide --json '<obj>' or --file <path>");
}

/** Deep-merge a patch onto an entry; birth/death merge field-by-field. */
function mergeEntry(base, patch) {
  const out = { ...base, ...patch };
  for (const k of ["birth", "death"]) {
    if (patch[k]) out[k] = { ...(base[k] ?? {}), ...patch[k] };
  }
  return out;
}

function reportResult(r) {
  if (r.namesAdded)
    console.log(dim(`  +${r.namesAdded} name(s) added to autocomplete index`));
  for (const w of r.warnings ?? []) console.log(yellow("  warn: ") + w);
}

// --- commands ---------------------------------------------------------------

async function cmdList(flags) {
  const pool = await loadPool();
  const rows = flags.all ? pool : pool.slice(0, 20);
  console.log(
    bold("born2die schedule") +
      dim(`  (array order = rotation; showing ${rows.length}/${pool.length})`),
  );
  rows.forEach((p, i) => {
    const flag = p.needsReview ? yellow("⚠") : " ";
    const tag = isManual(p) ? cyan("[manual]") : dim(p.qid.padEnd(8));
    console.log(
      `${String(i).padStart(3)}  ${flag} ${tag}  ${bold(p.answer)}  ` +
        dim(
          `(${formatYear(p.birth.year)} ${p.birth.place} → ` +
            `${formatYear(p.death.year)} ${p.death.place})  ${p.hints?.length ?? 0} hints`,
        ),
    );
  });
}

async function cmdValidate() {
  const pool = await loadPool();
  let errors = 0;
  let warns = 0;
  for (const p of pool) {
    const { errors: es, warnings: ws } = validateEntry(p, pool, p.id);
    for (const e of es) {
      console.log(`${red("ERROR")} ${p.answer} ${dim(`(${p.id})`)}: ${e}`);
      errors++;
    }
    for (const w of ws) {
      console.log(`${yellow("warn ")} ${p.answer} ${dim(`(${p.id})`)}: ${w}`);
      warns++;
    }
  }
  console.log(`\n${pool.length} entries · ${errors} error(s) · ${warns} warning(s)`);
  if (errors) process.exit(1);
}

async function cmdSync() {
  const { namesAdded, count } = await syncAll();
  console.log(
    `${green("synced")} ${count} entries · +${namesAdded} name(s) added to autocomplete index`,
  );
}

async function cmdHints(id, flags) {
  if (!id) die('usage: hints <id> --set "h1" "h2" "h3"');
  if (!Array.isArray(flags.set) || flags.set.length === 0)
    die('provide hints with --set "h1" "h2" "h3"');
  const pool = await loadPool();
  const existing = pool.find((p) => p.id === id);
  if (!existing) die(`no entry with id "${id}"`);
  const merged = { ...existing, hints: flags.set };
  const r = await upsertEntry(merged, { changedFields: ["hints"] });
  console.log(`${green("updated hints")} for ${bold(existing.answer)}:`);
  flags.set.forEach((h, i) => console.log(dim(`  ${i + 1}. `) + h));
  reportResult(r);
}

async function cmdMove(id, flags) {
  if (!id || flags.to === undefined) die("usage: move <id> --to <position>");
  const to = Number.parseInt(flags.to, 10);
  if (!Number.isInteger(to) || to < 0) die("--to must be a non-negative integer");
  const r = await moveEntry(id, to);
  console.log(`${green("moved")} ${r.id} → schedule position ${r.to}`);
}

async function cmdExclude(qid) {
  if (!qid || !/^Q\d+$/.test(qid)) die("usage: exclude <Q-number>");
  await excludeEntry(qid);
  console.log(
    `${green("excluded")} ${qid} (added exclude:true to overrides, removed from pool)`,
  );
}

async function cmdAdd(flags) {
  const input = await readEntryInput(flags);
  const opts = {};
  if (flags.position !== undefined) opts.position = Number.parseInt(flags.position, 10);
  const r = await upsertEntry(input, opts);
  if (!r.created)
    console.log(yellow("note: ") + "an entry with that id existed and was updated");
  console.log(
    `${green("added")} ${bold(r.entry.answer)} ${dim(`(${r.entry.id}, ${r.entry.qid})`)}`,
  );
  reportResult(r);
}

async function cmdEdit(id, flags) {
  if (!id) die("usage: edit <id> --json '<patch>' | --file <path>");
  const pool = await loadPool();
  const existing = pool.find((p) => p.id === id);
  if (!existing) die(`no entry with id "${id}"`);
  const patch = await readEntryInput(flags);
  const merged = mergeEntry(existing, patch);
  const changedFields = Object.keys(patch).filter((k) => k !== "id" && k !== "qid");
  const r = await upsertEntry(merged, { changedFields });
  console.log(
    `${green("edited")} ${bold(existing.answer)} ${dim(`(${id})`)} · fields: ${changedFields.join(", ")}`,
  );
  reportResult(r);
}

// --- dispatch ---------------------------------------------------------------

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const { flags, positional } = parseFlags(rest);
  switch (cmd) {
    case "list": return cmdList(flags);
    case "validate": return cmdValidate();
    case "sync": return cmdSync();
    case "hints": return cmdHints(positional[0], flags);
    case "move": return cmdMove(positional[0], flags);
    case "exclude": return cmdExclude(positional[0]);
    case "add": return cmdAdd(flags);
    case "edit": return cmdEdit(positional[0], flags);
    default:
      console.log(
        "Usage: node scripts/entry.mjs <command>\n\n" +
          "  list [--all]                     show the schedule\n" +
          "  validate                         report validation issues\n" +
          "  sync                             refresh autocomplete index\n" +
          '  hints <id> --set "h1" "h2" ...   replace textual hints\n' +
          "  move <id> --to <pos>             reorder the schedule\n" +
          "  exclude <qid>                    drop a scanned figure\n" +
          "  add --json '<obj>'|--file <p> [--position N]\n" +
          "  edit <id> --json '<patch>'|--file <p>\n",
      );
      process.exit(cmd ? 1 : 0);
  }
}

main().catch((err) => {
  console.error(red(err.message ?? String(err)));
  process.exit(1);
});
