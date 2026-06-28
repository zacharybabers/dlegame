import MapPanel from "@/components/MapPanel";
import { SAMPLE_PUZZLE } from "@/lib/puzzle";

export default function Home() {
  const { birth, death } = SAMPLE_PUZZLE;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8">
      <header className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">born2die</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          A historical figure was born at the{" "}
          <span className="font-medium text-green-600">green</span> marker and
          died at the <span className="font-medium text-red-600">red</span>{" "}
          marker. Guess who they were
        </p>
      </header>

      <MapPanel birth={birth} death={death} />

      <section className="rounded-xl border border-dashed border-zinc-300 p-4 text-center text-sm text-zinc-500 dark:border-zinc-700">
        Guess who it is
      </section>
    </main>
  );
}
