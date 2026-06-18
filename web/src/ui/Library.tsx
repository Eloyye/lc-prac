import { useMemo, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useLibrary } from "../store/library";
import { allTags, filterProblems } from "@shared/content/filter";
import type { DifficultyFilter } from "@shared/content/filter";
import { usePreferences } from "../store/preferences";
import { ProblemCard } from "./ProblemCard";
import { ProblemDialog } from "./ProblemDialog";

const DIFFICULTIES: DifficultyFilter[] = ["all", "easy", "medium", "hard"];

export function Library() {
  const problems = useLibrary((s) => s.problems);
  const status = useLibrary((s) => s.status);
  const error = useLibrary((s) => s.error);
  const load = useLibrary((s) => s.load);
  const saveProblem = useLibrary((s) => s.saveProblem);
  const deleteProblem = useLibrary((s) => s.deleteProblem);
  const openPalette = usePreferences((s) => s.openPalette);
  const openSettings = usePreferences((s) => s.openSettings);

  const navigate = useNavigate();
  const search = useSearch({ from: "/problems" });
  // Filters live in the URL: `/problems?q=…&difficulty=…&tag=…`. Defaults map
  // back to the values `filterProblems` expects.
  const query = search.q ?? "";
  const difficulty = search.difficulty ?? "all";
  const tag = search.tag ?? null;

  const [importing, setImporting] = useState(false);

  const setQuery = (value: string): void => {
    navigate({
      to: "/problems",
      search: (prev) => ({ ...prev, q: value === "" ? undefined : value }),
      replace: true,
    });
  };
  const setDifficulty = (value: DifficultyFilter): void => {
    navigate({
      to: "/problems",
      search: (prev) => ({ ...prev, difficulty: value === "all" ? undefined : value }),
      replace: true,
    });
  };
  const setTag = (value: string | null): void => {
    navigate({
      to: "/problems",
      search: (prev) => ({ ...prev, tag: value === null || value === "" ? undefined : value }),
      replace: true,
    });
  };

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
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={openPalette}
              className="rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-400 hover:border-neutral-500 hover:text-white"
            >
              Commands <kbd className="ml-1 font-mono text-xs">⌘K</kbd>
            </button>
            <button
              type="button"
              onClick={openSettings}
              className="rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-400 hover:border-neutral-500 hover:text-white"
            >
              Settings
            </button>
            <button
              type="button"
              onClick={() => setImporting(true)}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
            >
              Import solution
            </button>
          </div>
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

        {status === "error" ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-rose-400">{error ?? "Could not load the library."}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-300 hover:border-neutral-500 hover:text-white"
            >
              Retry
            </button>
          </div>
        ) : status !== "ready" ? (
          <p className="text-neutral-500">Loading library…</p>
        ) : filtered.length === 0 ? (
          <p className="text-neutral-500">No problems match your filters.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((problem) => (
              <ProblemCard
                key={problem.id}
                problem={problem}
                search={search}
                onDelete={deleteProblem}
              />
            ))}
          </div>
        )}
      </div>

      {importing && <ProblemDialog onClose={() => setImporting(false)} onSubmit={saveProblem} />}
    </div>
  );
}
