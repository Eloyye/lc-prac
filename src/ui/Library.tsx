import { useMemo, useState } from "react";
import type { Problem, Solution } from "../types";
import { useLibrary } from "../store/library";
import { allTags, filterProblems } from "../content/filter";
import type { DifficultyFilter } from "../content/filter";
import { ProblemCard } from "./ProblemCard";
import { ImportDialog } from "./ImportDialog";

interface LibraryProps {
  onStart: (problem: Problem, solution: Solution) => void;
}

const DIFFICULTIES: DifficultyFilter[] = ["all", "easy", "medium", "hard"];

export function Library({ onStart }: LibraryProps) {
  const problems = useLibrary((s) => s.problems);
  const addCustom = useLibrary((s) => s.addCustom);
  const removeCustom = useLibrary((s) => s.removeCustom);

  const [query, setQuery] = useState("");
  const [difficulty, setDifficulty] = useState<DifficultyFilter>("all");
  const [tag, setTag] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const tags = useMemo(() => allTags(problems), [problems]);
  const filtered = useMemo(
    () => filterProblems(problems, { query, difficulty, tag }),
    [problems, query, difficulty, tag],
  );

  return (
    <div className="relative min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">CodeType</h1>
            <p className="text-sm text-neutral-400">
              Pick a solution to practice typing from memory.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setImporting(true)}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
          >
            Import solution
          </button>
        </header>

        <div className="mb-6 flex flex-wrap items-center gap-3">
          <input
            className="w-56 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-neutral-500"
            placeholder="Search problems…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="flex gap-1">
            {DIFFICULTIES.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDifficulty(d)}
                className={`rounded-lg px-3 py-1.5 text-sm capitalize ${
                  difficulty === d
                    ? "bg-neutral-700 text-white"
                    : "text-neutral-400 hover:bg-neutral-800"
                }`}
              >
                {d}
              </button>
            ))}
          </div>
          <select
            className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-neutral-500"
            value={tag ?? ""}
            onChange={(e) => setTag(e.target.value === "" ? null : e.target.value)}
          >
            <option value="">All tags</option>
            {tags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        {filtered.length === 0 ? (
          <p className="text-neutral-500">No problems match your filters.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((problem) => (
              <ProblemCard
                key={problem.id}
                problem={problem}
                onStart={onStart}
                onDelete={removeCustom}
              />
            ))}
          </div>
        )}
      </div>

      {importing && <ImportDialog onClose={() => setImporting(false)} onAdd={addCustom} />}
    </div>
  );
}
