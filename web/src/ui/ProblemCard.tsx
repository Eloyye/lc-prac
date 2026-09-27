import { Link } from "@tanstack/react-router";
import type { SavedBestScore } from "@shared/domain/attempt";
import type { Mode } from "@shared/domain/mode";
import type { Problem } from "@shared/domain/problem";
import type { LibrarySearch } from "@shared/content/filter";
import { bestFor } from "../store/history";
import { SetlistRow } from "./SetlistRow";

interface ProblemCardProps {
  problem: Problem;
  search: LibrarySearch;
  bestScores: SavedBestScore[];
  mode: Mode;
  onArchive: (problem: Problem) => void;
}

/** One active Library entry: a setlist row whose score column is the Mode's PB. */
export function ProblemCard({ problem, search, bestScores, mode, onArchive }: ProblemCardProps) {
  const bestCpms = problem.solutions
    .map((s) => bestFor(bestScores, problem.id, s.id, mode)?.bestCpm)
    .filter((v): v is number => v !== undefined);
  const bestCpm = bestCpms.length > 0 ? Math.max(...bestCpms) : null;
  const count = problem.solutions.length;

  return (
    <SetlistRow
      problem={problem}
      title={
        <Link
          to="/problems/$problemId"
          params={{ problemId: problem.id }}
          search={search}
          className="outline-none after:absolute after:inset-0 after:content-['']"
        >
          {problem.title}
        </Link>
      }
      meta={`${count} ${count === 1 ? "approach" : "approaches"}`}
      aside={
        <>
          {problem.origin === "custom" && (
            <button
              type="button"
              onClick={() => onArchive(problem)}
              className="relative z-10 rounded-full border-2 border-cobalt-600 px-3 py-1 text-xs font-semibold text-cobalt-200 hover:border-lemon hover:text-lemon"
              aria-label={`Archive ${problem.title}`}
            >
              Archive
            </button>
          )}
          {bestCpm !== null ? (
            <div className="min-w-20 text-right">
              <div className="font-display text-4xl leading-none font-black text-lemon tabular-nums">
                {Math.round(bestCpm)}
              </div>
              <div className="text-xs text-cobalt-300">
                {mode[0]!.toUpperCase() + mode.slice(1)} best, cpm
              </div>
            </div>
          ) : (
            <div className="text-right font-display text-base font-semibold whitespace-nowrap text-cobalt-600 sm:min-w-20 sm:text-xl">
              Not played
            </div>
          )}
        </>
      }
    />
  );
}
