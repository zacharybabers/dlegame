import Game from "@/components/Game";
import DevPanel from "@/components/DevPanel";
import HowToPlay from "@/components/HowToPlay";
import ColorblindToggle from "@/components/ColorblindToggle";
import StatsButton from "@/components/StatsButton";
import { FIGURE_NAMES } from "@/lib/figures";
import { PUZZLES, getDailyPuzzle, resolveDayNumber } from "@/lib/daily";

const isDev = process.env.NODE_ENV !== "production";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const dayNumber = resolveDayNumber(params);
  const puzzle = getDailyPuzzle(dayNumber);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-2">
        <div className="flex justify-end gap-2">
          <StatsButton />
          <ColorblindToggle />
          <HowToPlay />
        </div>
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">born2die</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            A historical figure was born at the{" "}
            <span className="font-medium text-green-600">green</span> marker and
            died at the <span className="font-medium text-red-600">red</span>{" "}
            marker. Guess who they were — the map starts unlabeled, and each
            wrong guess reveals a hint.
          </p>
        </div>
      </header>

      <Game puzzle={puzzle} candidates={FIGURE_NAMES} dayNumber={dayNumber} />

      <footer className="flex items-center justify-between text-xs text-zinc-400">
        <span>Day #{dayNumber}</span>
        <span>by zjb</span>
      </footer>

      {isDev && (
        <DevPanel
          dayNumber={dayNumber}
          answer={puzzle.answer}
          poolSize={PUZZLES.length}
          pool={PUZZLES.map((p, index) => ({ index, answer: p.answer }))}
        />
      )}
    </main>
  );
}
