import { useMemo, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useLibrary } from "../store/library";
import { allTags, filterProblems } from "@shared/content/filter";
import type { DifficultyFilter } from "@shared/content/filter";
import { usePreferences } from "../store/preferences";
import { ProblemCard } from "./ProblemCard";
import { ProblemDialog } from "./ProblemDialog";
import { AccountControl } from "./AccountControl";
import { authClient } from "../api/auth";
import type { Problem } from "@shared/types";
import { HeaderMenu } from "./HeaderMenu";
import type { HeaderMenuItem } from "./HeaderMenu";

const DIFFICULTIES: DifficultyFilter[] = ["all", "easy", "medium", "hard"];

/** Inline (≥md) button styling for a header action, keyed off its menu variant. */
function actionClass(variant: HeaderMenuItem["variant"]): string {
  return variant === "primary"
    ? "rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
    : "rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-400 hover:border-neutral-500 hover:text-white";
}

export function Library() {
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const problems = useLibrary((s) => s.problems);
  const archived = useLibrary((s) => s.archived);
  const hiddenProblems = useLibrary((s) => s.hiddenProblems);
  const overriddenProblemIds = useLibrary((s) => s.overriddenProblemIds);
  const status = useLibrary((s) => s.status);
  const error = useLibrary((s) => s.error);
  const actionError = useLibrary((s) => s.actionError);
  const load = useLibrary((s) => s.load);
  const saveProblem = useLibrary((s) => s.saveProblem);
  const deleteProblem = useLibrary((s) => s.deleteProblem);
  const restoreProblem = useLibrary((s) => s.restoreProblem);
  const resetProblem = useLibrary((s) => s.resetProblem);
  const permanentlyDeleteProblem = useLibrary((s) => s.permanentlyDeleteProblem);
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
  const [view, setView] = useState<"active" | "hidden" | "archived">("active");

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

  const displayedProblems =
    view === "active" ? problems : view === "hidden" ? hiddenProblems : archived;
  const tags = useMemo(() => allTags(displayedProblems), [displayedProblems]);
  const filtered = useMemo(
    () => filterProblems(displayedProblems, { query, difficulty, tag }),
    [displayedProblems, query, difficulty, tag],
  );

  const archive = (problem: Problem): void => {
    if (window.confirm(`Archive "${problem.title}"? You can restore it later.`)) {
      void deleteProblem(problem.id).catch(() => {});
    }
  };

  const permanentlyDelete = (problem: Problem): void => {
    if (window.confirm(`Permanently delete "${problem.title}"? This cannot be undone.`)) {
      void permanentlyDeleteProblem(problem.id).catch(() => {});
    }
  };

  // One source of truth for the header actions: rendered inline as buttons at
  // `md` and up, and collapsed into the HeaderMenu hamburger below it.
  const actions: HeaderMenuItem[] = [
    { label: "Commands", kbd: "⌘K", onClick: openPalette },
    { label: "Settings", onClick: openSettings },
    {
      label: "Create problem",
      variant: "primary",
      onClick: () => setImporting(true),
      disabled: sessionPending || session === null,
      title: session === null ? "Sign in to create synced custom Problems" : undefined,
    },
  ];

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
            <div className="hidden items-center gap-2 md:flex">
              {actions.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  onClick={action.onClick}
                  disabled={action.disabled}
                  title={action.title}
                  className={`${actionClass(action.variant)} disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  {action.label}
                  {action.kbd !== undefined && (
                    <kbd className="ml-1 font-mono text-xs">{action.kbd}</kbd>
                  )}
                </button>
              ))}
            </div>
            <HeaderMenu items={actions} className="md:hidden" />
            <span className="mx-1 h-6 w-px bg-neutral-700" aria-hidden="true" />
            <AccountControl />
          </div>
        </header>

        <div className="mb-6 flex flex-wrap items-center gap-3">
          <div className="flex rounded-lg border border-neutral-700 p-0.5 text-sm">
            {(["active", "hidden", "archived"] as const).map((candidate) => (
              <button
                key={candidate}
                type="button"
                onClick={() => setView(candidate)}
                className={`rounded-md px-3 py-1.5 capitalize ${
                  view === candidate ? "bg-neutral-700 text-white" : "text-neutral-400"
                }`}
              >
                {candidate}
              </button>
            ))}
          </div>
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

        {actionError !== null && <p className="mb-4 text-sm text-rose-400">{actionError}</p>}

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
            {filtered.map((problem) =>
              view === "active" ? (
                <ProblemCard
                  key={problem.id}
                  problem={problem}
                  search={search}
                  onArchive={archive}
                />
              ) : view === "archived" ? (
                <div
                  key={problem.id}
                  className="flex flex-col gap-3 rounded-xl border border-neutral-800 bg-neutral-900 p-4"
                >
                  <div>
                    <h3 className="font-medium text-neutral-100">{problem.title}</h3>
                    <span className="text-xs uppercase text-neutral-500">{problem.difficulty}</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {problem.tags.map((problemTag) => (
                      <span
                        key={problemTag}
                        className="rounded bg-neutral-800 px-1.5 py-0.5 text-xs text-neutral-400"
                      >
                        {problemTag}
                      </span>
                    ))}
                  </div>
                  <div className="mt-auto flex gap-2">
                    <button
                      type="button"
                      onClick={() => void restoreProblem(problem.id).catch(() => {})}
                      className="rounded-lg border border-emerald-700 px-3 py-1.5 text-sm text-emerald-300 hover:border-emerald-500"
                    >
                      Restore
                    </button>
                    <button
                      type="button"
                      onClick={() => permanentlyDelete(problem)}
                      className="rounded-lg border border-red-900 px-3 py-1.5 text-sm text-red-400 hover:border-red-600"
                    >
                      Delete permanently
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  key={problem.id}
                  className="flex items-center justify-between gap-4 rounded-xl border border-neutral-800 bg-neutral-900 p-4"
                >
                  <div>
                    <h3 className="font-medium text-neutral-100">{problem.title}</h3>
                    <span className="text-xs uppercase text-neutral-500">{problem.difficulty}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {overriddenProblemIds.includes(problem.id) && (
                      <button
                        type="button"
                        onClick={() => void resetProblem(problem.id).catch(() => {})}
                        className="text-xs text-neutral-500 hover:text-neutral-200"
                      >
                        Reset
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void restoreProblem(problem.id).catch(() => {})}
                      className="rounded-lg border border-emerald-700 px-3 py-1.5 text-sm text-emerald-300 hover:border-emerald-500"
                    >
                      Restore
                    </button>
                  </div>
                </div>
              ),
            )}
          </div>
        )}
      </div>

      {importing && <ProblemDialog onClose={() => setImporting(false)} onSubmit={saveProblem} />}
    </div>
  );
}
