import { useState } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import type { Mode, Problem, Solution } from "@shared/types";
import { bestFor, hasOverride, recentAttemptsForProblem } from "../persistence/storage";
import { useLibrary } from "../store/library";
import { DIFFICULTY_COLOR } from "./difficulty";
import { Markdown } from "./Markdown";
import { ProblemDialog } from "./ProblemDialog";
import { AccountControl } from "./AccountControl";
import { HeaderMenu } from "./HeaderMenu";
import type { HeaderMenuItem } from "./HeaderMenu";

const sectionHeading = "mb-3 text-sm font-medium uppercase tracking-wide text-neutral-500";

/** Inline (≥md) button styling for a header action, keyed off its menu variant. */
function actionClass(variant: HeaderMenuItem["variant"]): string {
  const base = "rounded-lg border border-neutral-700 px-3 py-1.5 text-sm";
  return variant === "danger"
    ? `${base} text-neutral-300 hover:border-red-500 hover:text-red-400`
    : `${base} text-neutral-300 hover:border-neutral-500`;
}

// Display label per Mode. Only Copy is wired today (every Attempt is hardcoded to
// it); Recall and Free are listed so the mode-aware PB/Attempt UI below needs no
// redesign once they ship — PB is tracked per Mode (see CONTEXT.md).
const MODE_LABEL: Record<Mode, string> = {
  copy: "Copy",
  recall: "Recall",
  free: "Free",
};

function complexityLabel(solution: Solution): string | null {
  const parts: string[] = [];
  if (solution.timeComplexity !== undefined) parts.push(`Time ${solution.timeComplexity}`);
  if (solution.spaceComplexity !== undefined) parts.push(`Space ${solution.spaceComplexity}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function ProblemDetail({ problem }: { problem: Problem }) {
  const navigate = useNavigate();
  const search = useSearch({ from: "/problems/$problemId" });
  const saveProblem = useLibrary((s) => s.saveProblem);
  const deleteProblem = useLibrary((s) => s.deleteProblem);
  const resetProblem = useLibrary((s) => s.resetProblem);
  const [editing, setEditing] = useState(false);

  const attempts = recentAttemptsForProblem(problem.id);
  // Attempts only store a solutionId; resolve the approach from the Problem's
  // current Solutions, tolerating one that has since been removed.
  const approachFor = (solutionId: string): string =>
    problem.solutions.find((s) => s.id === solutionId)?.approach ?? "Removed approach";

  // A bundled Problem can be reverted only once the user has actually edited it.
  const canReset = problem.origin === "bundled" && hasOverride(problem.id);

  const handleDelete = (): void => {
    if (
      window.confirm(
        `Delete "${problem.title}"? This also removes its attempts and personal bests.`,
      )
    ) {
      deleteProblem(problem.id);
      navigate({ to: "/problems", search });
    }
  };

  const handleReset = (): void => {
    if (
      window.confirm(`Reset "${problem.title}" to the original version? Your edits are discarded.`)
    ) {
      resetProblem(problem.id);
    }
  };

  // One source of truth for the header actions: rendered inline as buttons at
  // `md` and up, and collapsed into the HeaderMenu hamburger below it. Reset is
  // present only when a bundled Problem has local edits to revert.
  const actions: HeaderMenuItem[] = [
    { label: "Edit", onClick: () => setEditing(true) },
    ...(canReset ? [{ label: "Reset to original", onClick: handleReset }] : []),
    { label: "Delete", variant: "danger", onClick: handleDelete },
  ];

  return (
    <div className="relative min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <div className="flex items-center justify-between gap-4">
          <Link
            to="/problems"
            search={search}
            className="text-sm text-neutral-400 hover:text-neutral-200"
          >
            ← Back to the library
          </Link>
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-2 md:flex">
              {actions.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  onClick={action.onClick}
                  className={actionClass(action.variant)}
                >
                  {action.label}
                </button>
              ))}
            </div>
            <HeaderMenu items={actions} className="md:hidden" />
            <span className="mx-1 h-6 w-px bg-neutral-700" aria-hidden="true" />
            <AccountControl />
          </div>
        </div>

        <header className="mt-4 mb-8">
          <h1 className="text-2xl font-semibold">{problem.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className={`uppercase ${DIFFICULTY_COLOR[problem.difficulty]}`}>
              {problem.difficulty}
            </span>
            {problem.origin === "custom" && (
              <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-neutral-400">Custom</span>
            )}
            {problem.tags.map((tag) => (
              <span key={tag} className="rounded bg-neutral-800 px-1.5 py-0.5 text-neutral-400">
                {tag}
              </span>
            ))}
          </div>
          {problem.url !== undefined && (
            <a
              href={problem.url}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-block text-sm text-emerald-400 hover:text-emerald-300"
            >
              View problem source ↗
            </a>
          )}
        </header>

        {problem.statement !== undefined && (
          <section className="mb-8">
            <h2 className={sectionHeading}>Description</h2>
            <Markdown source={problem.statement} />
          </section>
        )}

        {(problem.expectedTime !== undefined || problem.expectedSpace !== undefined) && (
          <section className="mb-8">
            <h2 className={sectionHeading}>Requirements</h2>
            {/* Problem-level *targets* the solver should aim for — distinct from
                each Approach's measured complexity shown below. */}
            <div className="flex flex-wrap gap-2 text-sm">
              {problem.expectedTime !== undefined && (
                <span className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-1.5">
                  <span className="text-neutral-500">Target time </span>
                  <span className="font-mono text-neutral-200">{problem.expectedTime}</span>
                </span>
              )}
              {problem.expectedSpace !== undefined && (
                <span className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-1.5">
                  <span className="text-neutral-500">Target space </span>
                  <span className="font-mono text-neutral-200">{problem.expectedSpace}</span>
                </span>
              )}
            </div>
          </section>
        )}

        {problem.examples !== undefined && problem.examples.length > 0 && (
          <section className="mb-8">
            <h2 className={sectionHeading}>Examples</h2>
            <div className="flex flex-col gap-3">
              {problem.examples.map((example, index) => (
                <div
                  key={index}
                  className="rounded-xl border border-neutral-800 bg-neutral-900 p-4"
                >
                  <div className="mb-2 text-xs font-medium text-neutral-400">
                    Example {index + 1}
                  </div>
                  <dl className="flex flex-col gap-2 text-sm">
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-neutral-500">Input</dt>
                      <dd className="mt-1 overflow-auto whitespace-pre-wrap font-mono text-neutral-200">
                        {example.input}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-neutral-500">Output</dt>
                      <dd className="mt-1 overflow-auto whitespace-pre-wrap font-mono text-neutral-200">
                        {example.output}
                      </dd>
                    </div>
                    {example.explanation !== undefined && (
                      <div>
                        <dt className="text-xs uppercase tracking-wide text-neutral-500">
                          Explanation
                        </dt>
                        <dd className="mt-1 text-neutral-400">{example.explanation}</dd>
                      </div>
                    )}
                  </dl>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="mb-8">
          <h2 className={sectionHeading}>Approaches</h2>
          <div className="flex flex-col gap-2">
            {problem.solutions.map((solution) => {
              const best = bestFor(problem.id, solution.id);
              const complexity = complexityLabel(solution);
              return (
                <Link
                  key={solution.id}
                  to="/problems/$problemId/$solutionId"
                  params={{ problemId: problem.id, solutionId: solution.id }}
                  search={search}
                  className="group flex items-center justify-between gap-4 rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 hover:border-emerald-500"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-neutral-100 group-hover:text-white">
                      {solution.approach}
                    </div>
                    {complexity !== null && (
                      <div className="mt-0.5 text-xs text-neutral-500">{complexity}</div>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-xs text-neutral-500">{MODE_LABEL.copy} PB</div>
                    <div className="tabular-nums text-neutral-200">
                      {best !== undefined ? `${Math.round(best.bestCpm)} CPM` : "—"}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        <section>
          <h2 className={sectionHeading}>Recent attempts</h2>
          {attempts.length === 0 ? (
            <p className="text-sm text-neutral-500">
              No attempts yet — pick an approach above to start a session.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {attempts.map((attempt) => (
                <li
                  key={attempt.id}
                  className="flex items-center justify-between gap-4 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-sm"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-neutral-200">
                      {approachFor(attempt.solutionId)}
                    </span>
                    <span className="shrink-0 rounded bg-neutral-800 px-1.5 py-0.5 text-xs text-neutral-400">
                      {MODE_LABEL[attempt.mode]}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-xs">
                    <span className="font-medium tabular-nums text-neutral-200">
                      {Math.round(attempt.cpm)} CPM
                    </span>
                    <span className="tabular-nums text-neutral-500">
                      {Math.round(attempt.accuracyPct)}%
                    </span>
                    <span className="text-neutral-600">{formatDate(attempt.createdAt)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {editing && (
        <ProblemDialog initial={problem} onClose={() => setEditing(false)} onSubmit={saveProblem} />
      )}
    </div>
  );
}
