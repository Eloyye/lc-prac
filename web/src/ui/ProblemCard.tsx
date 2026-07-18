import { Link } from "@tanstack/react-router";
import type { Mode, Problem, SavedBestScore } from "@shared/types";
import type { LibrarySearch } from "@shared/content/filter";
import { bestFor } from "../store/history";
import { DIFFICULTY_COLOR } from "./difficulty";

interface ProblemCardProps {
  problem: Problem;
  search: LibrarySearch;
  bestScores: SavedBestScore[];
  mode: Mode;
  onArchive: (problem: Problem) => void;
}

export function ProblemCard({ problem, search, bestScores, mode, onArchive }: ProblemCardProps) {
  const bestCpms = problem.solutions
    .map((s) => bestFor(bestScores, problem.id, s.id, mode)?.bestCpm)
    .filter((v): v is number => v !== undefined);
  const bestCpm = bestCpms.length > 0 ? Math.max(...bestCpms) : null;
  const count = problem.solutions.length;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-neutral-800 bg-neutral-900 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-medium text-neutral-100">
            <Link
              to="/problems/$problemId"
              params={{ problemId: problem.id }}
              search={search}
              className="hover:text-emerald-400"
            >
              {problem.title}
            </Link>
          </h3>
          <div className="mt-1 flex items-center gap-2 text-xs">
            <span className={`uppercase ${DIFFICULTY_COLOR[problem.difficulty]}`}>
              {problem.difficulty}
            </span>
            {problem.origin === "custom" && (
              <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-neutral-400">Custom</span>
            )}
            {bestCpm !== null && (
              <span className="text-neutral-500">
                {mode[0]!.toUpperCase() + mode.slice(1)} PB {Math.round(bestCpm)} CPM
              </span>
            )}
          </div>
        </div>
        {problem.origin === "custom" && (
          <button
            type="button"
            onClick={() => onArchive(problem)}
            className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-400 hover:border-amber-500 hover:text-amber-300"
            aria-label={`Archive ${problem.title}`}
          >
            Archive
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1">
        {problem.tags.map((tag) => (
          <span key={tag} className="rounded bg-neutral-800 px-1.5 py-0.5 text-xs text-neutral-400">
            {tag}
          </span>
        ))}
      </div>

      <Link
        to="/problems/$problemId"
        params={{ problemId: problem.id }}
        search={search}
        className="mt-auto flex items-center justify-between rounded-lg border border-neutral-700 px-3 py-1.5 text-sm text-neutral-200 hover:border-emerald-500 hover:text-white"
      >
        <span>
          {count} {count === 1 ? "approach" : "approaches"}
        </span>
        <span className="text-xs text-neutral-500">→</span>
      </Link>
    </div>
  );
}
