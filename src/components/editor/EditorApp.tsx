"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MapPanel from "@/components/MapPanel";
import type { Marker } from "@/lib/puzzle";
import { formatYear } from "@/lib/puzzle";

type PoolEntry = {
  id: string;
  qid: string;
  answer: string;
  aliases?: string[];
  hints?: string[];
  birth: Marker;
  death: Marker;
  needsReview?: boolean;
};

type MarkerForm = { lat: string; lng: string; year: string; place: string };
type Draft = {
  id?: string;
  qid?: string;
  answer: string;
  aliasesText: string;
  hints: string[];
  birth: MarkerForm;
  death: MarkerForm;
};

const EMPTY_MARKER: MarkerForm = { lat: "", lng: "", year: "", place: "" };
const blankDraft = (): Draft => ({
  answer: "",
  aliasesText: "",
  hints: ["", "", ""],
  birth: { ...EMPTY_MARKER },
  death: { ...EMPTY_MARKER },
});

const markerToForm = (m: Marker): MarkerForm => ({
  lat: String(m.lat),
  lng: String(m.lng),
  year: String(m.year),
  place: m.place,
});

const draftFromEntry = (e: PoolEntry): Draft => ({
  id: e.id,
  qid: e.qid,
  answer: e.answer,
  aliasesText: (e.aliases ?? []).join("\n"),
  hints: e.hints && e.hints.length ? [...e.hints] : ["", "", ""],
  birth: markerToForm(e.birth),
  death: markerToForm(e.death),
});

const num = (s: string) => {
  const n = Number(s);
  return Number.isFinite(n) && s.trim() !== "" ? n : NaN;
};
const markerFromForm = (f: MarkerForm): Marker => ({
  lat: num(f.lat),
  lng: num(f.lng),
  year: Number.parseInt(f.year, 10),
  place: f.place.trim(),
});
const validMarker = (m: Marker) =>
  Number.isFinite(m.lat) && Number.isFinite(m.lng) && Number.isFinite(m.year);

function entryFromDraft(draft: Draft) {
  return {
    ...(draft.id ? { id: draft.id } : {}),
    ...(draft.qid ? { qid: draft.qid } : {}),
    answer: draft.answer.trim(),
    aliases: draft.aliasesText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
    hints: draft.hints.map((h) => h.trim()).filter(Boolean),
    birth: markerFromForm(draft.birth),
    death: markerFromForm(draft.death),
  };
}

async function api(action: string, payload: Record<string, unknown>) {
  const res = await fetch("/api/editor", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...payload }),
  });
  return res.json();
}

export default function EditorApp() {
  const [pool, setPool] = useState<PoolEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(blankDraft);
  const [issues, setIssues] = useState<{ errors: string[]; warnings: string[] }>(
    { errors: [], warnings: [] },
  );
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const data = await fetch("/api/editor").then((r) => r.json());
    setPool(data.pool ?? []);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  // Debounced live validation whenever the draft changes.
  const validateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (validateTimer.current) clearTimeout(validateTimer.current);
    validateTimer.current = setTimeout(async () => {
      const result = await api("validate", { entry: entryFromDraft(draft) });
      setIssues({ errors: result.errors ?? [], warnings: result.warnings ?? [] });
    }, 300);
    return () => {
      if (validateTimer.current) clearTimeout(validateTimer.current);
    };
  }, [draft]);

  const selectEntry = (e: PoolEntry) => {
    setSelectedId(e.id);
    setDraft(draftFromEntry(e));
    setStatus("");
  };
  const newEntry = () => {
    setSelectedId(null);
    setDraft(blankDraft());
    setStatus("");
  };

  const previewBirth = markerFromForm(draft.birth);
  const previewDeath = markerFromForm(draft.death);
  const canPreview = validMarker(previewBirth) && validMarker(previewDeath);

  const setMarker = (which: "birth" | "death", key: keyof MarkerForm, v: string) =>
    setDraft((d) => ({ ...d, [which]: { ...d[which], [key]: v } }));

  const save = async () => {
    setBusy(true);
    setStatus("");
    const result = await api("upsert", { entry: entryFromDraft(draft) });
    setBusy(false);
    if (result.error) {
      setStatus(`❌ ${result.error}`);
      return;
    }
    setStatus(
      `✅ ${result.created ? "Added" : "Saved"} “${result.entry.answer}”` +
        (result.namesAdded ? ` · +${result.namesAdded} name(s) indexed` : "") +
        (result.warnings?.length ? ` · ${result.warnings.length} warning(s)` : ""),
    );
    await refresh();
    setSelectedId(result.entry.id);
    setDraft(draftFromEntry(result.entry as PoolEntry));
  };

  const move = async (id: string, to: number) => {
    if (to < 0 || to >= pool.length) return;
    await api("move", { id, to });
    await refresh();
  };

  const errorCount = issues.errors.length;

  const list = useMemo(
    () =>
      pool.map((p, i) => (
        <li
          key={p.id}
          className={`flex items-center gap-1 border-b border-zinc-100 dark:border-zinc-800 ${
            p.id === selectedId ? "bg-sky-50 dark:bg-sky-950/40" : ""
          }`}
        >
          <span className="w-8 shrink-0 text-right text-xs text-zinc-400">{i}</span>
          <button
            onClick={() => selectEntry(p)}
            className="flex-1 truncate px-2 py-1.5 text-left text-sm hover:text-sky-600"
            title={`${p.answer} (${p.qid})`}
          >
            {p.needsReview ? "⚠ " : ""}
            {p.answer}
          </button>
          <div className="flex shrink-0 pr-1 text-zinc-400">
            <button
              onClick={() => move(p.id, i - 1)}
              disabled={i === 0}
              className="px-1 hover:text-sky-600 disabled:opacity-30"
              title="Move up"
            >
              ↑
            </button>
            <button
              onClick={() => move(p.id, i + 1)}
              disabled={i === pool.length - 1}
              className="px-1 hover:text-sky-600 disabled:opacity-30"
              title="Move down"
            >
              ↓
            </button>
          </div>
        </li>
      )),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pool, selectedId],
  );

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl gap-4 p-4">
      {/* Schedule list */}
      <aside className="flex w-72 shrink-0 flex-col rounded-xl border border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
          <span className="text-sm font-semibold">Schedule ({pool.length})</span>
          <button
            onClick={newEntry}
            className="rounded-md bg-sky-600 px-2 py-1 text-xs font-medium text-white hover:bg-sky-700"
          >
            + New
          </button>
        </div>
        <ul className="flex-1 overflow-y-auto">{list}</ul>
      </aside>

      {/* Editor */}
      <section className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">
            {selectedId ? `Editing: ${draft.answer || "(unnamed)"}` : "New entry"}
            {draft.qid ? (
              <span className="ml-2 text-xs font-normal text-zinc-400">{draft.qid}</span>
            ) : null}
          </h1>
          <button
            onClick={save}
            disabled={busy || errorCount > 0}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>

        {status && <p className="text-sm">{status}</p>}
        {(errorCount > 0 || issues.warnings.length > 0) && (
          <div className="rounded-lg border border-zinc-200 p-2 text-xs dark:border-zinc-800">
            {issues.errors.map((e, i) => (
              <div key={`e${i}`} className="text-red-600">
                ● {e}
              </div>
            ))}
            {issues.warnings.map((w, i) => (
              <div key={`w${i}`} className="text-amber-600">
                ▲ {w}
              </div>
            ))}
          </div>
        )}

        <label className="text-sm">
          <span className="mb-1 block font-medium">Answer</span>
          <input
            value={draft.answer}
            onChange={(e) => setDraft((d) => ({ ...d, answer: e.target.value }))}
            className="w-full rounded-md border border-zinc-300 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
            placeholder="Full name"
          />
        </label>

        <label className="text-sm">
          <span className="mb-1 block font-medium">
            Aliases <span className="font-normal text-zinc-400">(one per line)</span>
          </span>
          <textarea
            value={draft.aliasesText}
            onChange={(e) => setDraft((d) => ({ ...d, aliasesText: e.target.value }))}
            rows={2}
            className="w-full rounded-md border border-zinc-300 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>

        <div className="text-sm">
          <span className="mb-1 block font-medium">
            Hints <span className="font-normal text-zinc-400">(vague → specific)</span>
          </span>
          <div className="flex flex-col gap-1">
            {draft.hints.map((h, i) => (
              <div key={i} className="flex items-center gap-1">
                <span className="w-4 text-xs text-zinc-400">{i + 1}</span>
                <input
                  value={h}
                  onChange={(e) =>
                    setDraft((d) => {
                      const hints = [...d.hints];
                      hints[i] = e.target.value;
                      return { ...d, hints };
                    })
                  }
                  className="flex-1 rounded-md border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
                />
                <button
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      hints: d.hints.filter((_, j) => j !== i),
                    }))
                  }
                  className="px-1 text-zinc-400 hover:text-red-600"
                  title="Remove hint"
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              onClick={() => setDraft((d) => ({ ...d, hints: [...d.hints, ""] }))}
              className="self-start text-xs text-sky-600 hover:underline"
            >
              + add hint
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {(["birth", "death"] as const).map((which) => (
            <fieldset
              key={which}
              className="rounded-lg border border-zinc-200 p-2 dark:border-zinc-800"
            >
              <legend className="px-1 text-sm font-medium capitalize">{which}</legend>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {(["lat", "lng", "year"] as const).map((k) => (
                  <label key={k}>
                    <span className="text-xs text-zinc-500">{k}</span>
                    <input
                      value={draft[which][k]}
                      onChange={(e) => setMarker(which, k, e.target.value)}
                      className="w-full rounded-md border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
                      placeholder={k === "year" ? "negative = BCE" : ""}
                    />
                  </label>
                ))}
                <label>
                  <span className="text-xs text-zinc-500">place</span>
                  <input
                    value={draft[which].place}
                    onChange={(e) => setMarker(which, "place", e.target.value)}
                    className="w-full rounded-md border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
                  />
                </label>
              </div>
            </fieldset>
          ))}
        </div>

        {/* Live map preview */}
        <div>
          <span className="mb-1 block text-sm font-medium">
            Preview
            {canPreview && (
              <span className="ml-2 font-normal text-zinc-400">
                {formatYear(previewBirth.year)} {previewBirth.place || "?"} →{" "}
                {formatYear(previewDeath.year)} {previewDeath.place || "?"}
              </span>
            )}
          </span>
          {canPreview ? (
            <MapPanel birth={previewBirth} death={previewDeath} showLabels />
          ) : (
            <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-zinc-300 text-sm text-zinc-400 dark:border-zinc-700">
              Enter numeric lat/lng/year for both markers to preview the map.
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
