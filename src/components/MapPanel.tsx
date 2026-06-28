"use client";

import dynamic from "next/dynamic";
import type { Marker } from "@/lib/puzzle";

/**
 * Leaflet touches the browser `window` object, so the map cannot be
 * server-rendered. Per the Next.js docs, `ssr: false` dynamic imports must
 * live inside a Client Component — hence this thin wrapper.
 */
const GameMap = dynamic(() => import("@/components/GameMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-sky-100 text-sm text-zinc-500">
      Loading map…
    </div>
  ),
});

export default function MapPanel({
  birth,
  death,
}: {
  birth: Marker;
  death: Marker;
}) {
  return (
    <div className="h-[60vh] w-full overflow-hidden rounded-xl border border-zinc-200 shadow-sm dark:border-zinc-800">
      <GameMap birth={birth} death={death} />
    </div>
  );
}
