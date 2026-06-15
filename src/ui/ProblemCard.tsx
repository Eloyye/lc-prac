import type { Problem, Solution } from "../types";
import { bestFor } from "../persistence/storage";

interface ProblemCardProps {
  problem: Problem;
  onStart: (problem: Problem, solution: Solution) => void;
  onDelete: (id: string) => void;
}

const DIFFICULTY_COLOR: Record<Problem["difficulty"], string> = {
  easy: "text-emerald-400",
  medium: "text-amber-400",
  hard: "text-red-400",
};

export function ProblemCard({ problem, onStart, onDelete }: ProblemCardProps) {
  const bestCpms = problem.solutions
    .map((s) => bestFor(problem.id, s.id)?.bestCpm)
    .filter((v): v is number => v !== undefined);
  const bestCpm = bestCpms.length > 0 ? Math.max(...bestCpms) : null;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-neutral-800 bg-neutral-900 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-medium text-neutral-100">{problem.title}</h3>
          <div className="mt-1 flex items-center gap-2 text-xs">
            <span className={`uppercase ${DIFFICULTY_COLOR[problem.difficulty]}`}>
              {problem.difficulty}
            </span>
            {problem.origin === "custom" && (
              <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-neutral-400">Custom</span>
            )}
            {bestCpm !== null && (
              <span className="text-neutral-500">PB {Math.round(bestCpm)} CPM</span>
            )}
          </div>
        </div>
        {problem.origin === "custom" && (
          <button
            type="button"
            onClick={() => onDelete(problem.id)}
            className="text-neutral-600 hover:text-red-400"
            aria-label={`Delete ${problem.title}`}
          >
            ✕
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

      <div className="mt-auto flex flex-col gap-1.5">
        {problem.solutions.map((solution) => (
          <button
            key={solution.id}
            type="button"
            onClick={() => onStart(problem, solution)}
            className="flex items-center justify-between rounded-lg border border-neutral-700 px-3 py-1.5 text-sm text-neutral-200 hover:border-emerald-500 hover:text-white"
          >
            <span>{solution.approach}</span>
            <span className="text-xs text-neutral-500">{solution.timeComplexity ?? ""} →</span>
          </button>
        ))}
      </div>
    </div>
  );
}
