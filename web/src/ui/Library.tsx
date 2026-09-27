import { useMemo, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useLibrary } from "../store/library";
import { allTags, filterProblems } from "@shared/content/filter";
import type { DifficultyFilter } from "@shared/content/filter";
import { usePreferences } from "../store/preferences";
import { useHistory } from "../store/history";
import { ProblemCard } from "./ProblemCard";
import { SetlistRow } from "./SetlistRow";
import { DIFFICULTY_BORDER, DIFFICULTY_COLOR, DIFFICULTY_FILL, DIFFICULTY_INK } from "./difficulty";
import { ProblemDialog } from "./ProblemDialog";
import { AccountControl } from "./AccountControl";
import { authClient } from "../api/auth";
import { DIFFICULTIES as PROBLEM_DIFFICULTIES } from "@shared/domain/problem";
import type { Problem } from "@shared/domain/problem";
import { HeaderMenu } from "./HeaderMenu";
import type { HeaderMenuItem } from "./HeaderMenu";

const DIFFICULTIES: DifficultyFilter[] = ["all", ...PROBLEM_DIFFICULTIES];

/** Inline (≥md) button styling for a header action, keyed off its menu variant. */
function actionClass(variant: HeaderMenuItem["variant"]): string {
  return variant === "primary"
    ? "rounded-full bg-pink px-4 py-2 text-sm font-bold text-pink-ink hover:bg-pink-light"
    : secondaryButton;
}

const secondaryButton =
  "rounded-full border-2 border-cobalt-600 px-3.5 py-1.5 text-sm font-semibold text-cobalt-200 hover:border-cobalt-300 hover:text-paper";
const restoreButton =
  "rounded-full border-2 border-mint px-3 py-1 text-sm font-semibold text-mint hover:bg-mint hover:text-mint-ink";

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
  const mode = usePreferences((s) => s.mode);
  const bestScores = useHistory((s) => s.bestScores);
  const historyOwnerUserId = useHistory((s) => s.ownerUserId);
  const historyStatus = useHistory((s) => s.status);
  const historyError = useHistory((s) => s.error);
  const loadHistory = useHistory((s) => s.load);
  const scopedBestScores = historyOwnerUserId === (session?.user.id ?? null) ? bestScores : [];

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

  const pill =
    "rounded-full border-2 px-3.5 py-1 text-sm font-semibold capitalize transition-colors";

  return (
    <div className="relative min-h-screen bg-cobalt-900 text-paper">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <header className="mb-6 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-display text-4xl leading-none font-black tracking-tight whitespace-nowrap sm:text-6xl">
              CodeType
              <span
                className="ml-1 inline-block h-[0.72em] w-[0.28em] translate-y-[0.06em] bg-pink motion-safe:animate-pulse"
                aria-hidden="true"
              />
            </h1>
            <p className="mt-2 text-sm text-cobalt-300">
              Pick a solution and type it until it sticks.
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
                    <kbd className="ml-1.5 font-sans text-xs text-cobalt-400">{action.kbd}</kbd>
                  )}
                </button>
              ))}
            </div>
            <HeaderMenu items={actions} className="md:hidden" />
            <span className="mx-1 h-6 w-0.5 bg-cobalt-700" aria-hidden="true" />
            <AccountControl />
          </div>
        </header>

        <div className="mb-5 flex flex-wrap items-center gap-2">
          <div
            className="flex rounded-full bg-cobalt-950 p-1 text-sm"
            role="group"
            aria-label="Library view"
          >
            {(["active", "hidden", "archived"] as const).map((candidate) => (
              <button
                key={candidate}
                type="button"
                aria-pressed={view === candidate}
                onClick={() => setView(candidate)}
                className={`rounded-full px-3.5 py-1 font-semibold capitalize ${
                  view === candidate
                    ? "bg-paper text-cobalt-900"
                    : "text-cobalt-300 hover:text-paper"
                }`}
              >
                {candidate}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Difficulty">
            {DIFFICULTIES.map((d) => {
              const selected = difficulty === d;
              if (d === "all") {
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setDifficulty(d)}
                    className={`${pill} ${
                      selected
                        ? "border-paper bg-paper text-cobalt-900"
                        : "border-cobalt-600 text-cobalt-200 hover:border-cobalt-300"
                    }`}
                  >
                    All
                  </button>
                );
              }
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setDifficulty(d)}
                  className={`${pill} ${DIFFICULTY_BORDER[d]} ${
                    selected
                      ? `${DIFFICULTY_FILL[d]} ${DIFFICULTY_INK[d]}`
                      : `${DIFFICULTY_COLOR[d]} hover:bg-cobalt-800`
                  }`}
                >
                  {d}
                </button>
              );
            })}
          </div>
          <div className="flex w-full gap-2 sm:ml-auto sm:w-auto">
            <input
              type="search"
              aria-label="Search problems"
              className="min-w-0 flex-1 rounded-full border-2 border-cobalt-600 bg-cobalt-950 px-4 py-1.5 text-sm text-paper outline-none placeholder:text-cobalt-400 focus:border-pink sm:w-52"
              placeholder="Search problems"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select
              aria-label="Filter by tag"
              className="rounded-full border-2 border-cobalt-600 bg-cobalt-950 px-3 py-1.5 text-sm text-paper outline-none focus:border-pink"
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
        </div>

        {actionError !== null && <p className="mb-4 text-sm text-tomato">{actionError}</p>}

        {session !== null && (historyStatus === "idle" || historyStatus === "loading") && (
          <p className="mb-4 text-sm text-cobalt-400">Loading Personal Bests…</p>
        )}
        {session !== null && historyStatus === "error" && (
          <div className="mb-4 flex items-center gap-3 text-sm">
            <p className="text-tomato">{historyError ?? "Could not load Personal Bests."}</p>
            <button
              type="button"
              onClick={() => void loadHistory().catch(() => {})}
              className={secondaryButton}
            >
              Retry
            </button>
          </div>
        )}

        {status === "error" ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-tomato">{error ?? "Could not load the library."}</p>
            <button type="button" onClick={() => void load()} className={secondaryButton}>
              Retry
            </button>
          </div>
        ) : status !== "ready" ? (
          <p className="text-cobalt-400">Loading library…</p>
        ) : filtered.length === 0 ? (
          <p className="border-t border-cobalt-700 py-10 text-center text-cobalt-300">
            No problems match these filters. Clear the search or pick another difficulty.
          </p>
        ) : (
          <ul className="border-b border-cobalt-700">
            {filtered.map((problem) =>
              view === "active" ? (
                <ProblemCard
                  key={problem.id}
                  problem={problem}
                  search={search}
                  bestScores={scopedBestScores}
                  mode={mode}
                  onArchive={archive}
                />
              ) : view === "archived" ? (
                <SetlistRow
                  key={problem.id}
                  problem={problem}
                  title={problem.title}
                  aside={
                    <>
                      <button
                        type="button"
                        onClick={() => void restoreProblem(problem.id).catch(() => {})}
                        className={restoreButton}
                      >
                        Restore
                      </button>
                      <button
                        type="button"
                        onClick={() => permanentlyDelete(problem)}
                        className="rounded-full border-2 border-tomato px-3 py-1 text-sm font-semibold text-tomato hover:bg-tomato hover:text-tomato-ink"
                      >
                        Delete permanently
                      </button>
                    </>
                  }
                />
              ) : (
                <SetlistRow
                  key={problem.id}
                  problem={problem}
                  title={problem.title}
                  aside={
                    <>
                      {overriddenProblemIds.includes(problem.id) && (
                        <button
                          type="button"
                          onClick={() => void resetProblem(problem.id).catch(() => {})}
                          className="text-xs font-medium text-cobalt-300 hover:text-paper"
                        >
                          Reset
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void restoreProblem(problem.id).catch(() => {})}
                        className={restoreButton}
                      >
                        Restore
                      </button>
                    </>
                  }
                />
              ),
            )}
          </ul>
        )}
      </div>

      {importing && <ProblemDialog onClose={() => setImporting(false)} onSubmit={saveProblem} />}
    </div>
  );
}
