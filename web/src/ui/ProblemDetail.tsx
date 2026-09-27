import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import type { SavedAttempt } from "@shared/domain/attempt";
import type { Mode } from "@shared/domain/mode";
import type { Problem, Solution } from "@shared/domain/problem";
import { listAttempts } from "../api/attempts";
import { authClient } from "../api/auth";
import { bestFor, useHistory } from "../store/history";
import { useLibrary } from "../store/library";
import { usePreferences } from "../store/preferences";
import { DIFFICULTY_COLOR, DIFFICULTY_FILL } from "./difficulty";
import { Markdown } from "./Markdown";
import { ProblemDialog } from "./ProblemDialog";
import { RecentAttempts } from "./RecentAttempts";
import { AccountControl } from "./AccountControl";
import { HeaderMenu } from "./HeaderMenu";
import type { HeaderMenuItem } from "./HeaderMenu";
import * as ui from "./styles";

/** Inline (≥md) button styling for a header action, keyed off its menu variant. */
function actionClass(variant: HeaderMenuItem["variant"]): string {
  return variant === "danger" ? ui.dangerButton : ui.secondaryButton;
}

// Personal Bests are scoped to the selected Mode (see CONTEXT.md).
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

export function ProblemDetail({ problem }: { problem: Problem }) {
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const navigate = useNavigate();
  const search = useSearch({ from: "/problems/$problemId" });
  const saveProblem = useLibrary((s) => s.saveProblem);
  const deleteProblem = useLibrary((s) => s.deleteProblem);
  const resetProblem = useLibrary((s) => s.resetProblem);
  const overriddenProblemIds = useLibrary((s) => s.overriddenProblemIds);
  const actionError = useLibrary((s) => s.actionError);
  const mode = usePreferences((s) => s.mode);
  const bestScores = useHistory((s) => s.bestScores);
  const historyOwnerUserId = useHistory((s) => s.ownerUserId);
  const historyStatus = useHistory((s) => s.status);
  const historyError = useHistory((s) => s.error);
  const loadBestScores = useHistory((s) => s.load);
  const [editing, setEditing] = useState(false);
  const [attempts, setAttempts] = useState<SavedAttempt[]>([]);
  const [attemptStatus, setAttemptStatus] = useState<"idle" | "loading" | "ready" | "error">(
    "idle",
  );
  const [attemptError, setAttemptError] = useState<string | null>(null);
  const attemptRequest = useRef(0);
  const userId = session?.user.id ?? null;
  const scopedBestScores = historyOwnerUserId === userId ? bestScores : [];

  const loadProblemAttempts = useCallback(async (): Promise<void> => {
    const requestId = ++attemptRequest.current;
    if (userId === null) {
      setAttempts([]);
      setAttemptStatus("ready");
      setAttemptError(null);
      return;
    }
    setAttemptStatus("loading");
    setAttemptError(null);
    try {
      const response = await listAttempts({ problemId: problem.id, limit: 5 });
      if (requestId !== attemptRequest.current) return;
      setAttempts(response.attempts);
      setAttemptStatus("ready");
    } catch (cause) {
      if (requestId !== attemptRequest.current) return;
      setAttemptStatus("error");
      setAttemptError(cause instanceof Error ? cause.message : "Could not load Attempt history.");
    }
  }, [problem.id, userId]);

  useEffect(() => {
    if (!sessionPending) void loadProblemAttempts();
  }, [loadProblemAttempts, sessionPending]);

  // A bundled Problem can be reverted only once the user has actually edited it.
  const canReset = problem.origin === "bundled" && overriddenProblemIds.includes(problem.id);

  const handleDelete = (): void => {
    const message =
      problem.origin === "custom"
        ? `Archive "${problem.title}"? You can restore it later.`
        : `Hide "${problem.title}"? You can restore it later.`;
    if (window.confirm(message)) {
      void deleteProblem(problem.id)
        .then(() => navigate({ to: "/problems", search }))
        .catch(() => {});
    }
  };

  const handleReset = (): void => {
    if (
      window.confirm(`Reset "${problem.title}" to the original version? Your edits are discarded.`)
    ) {
      void resetProblem(problem.id).catch(() => {});
    }
  };

  // One source of truth for the header actions: rendered inline as buttons at
  // `md` and up, and collapsed into the HeaderMenu hamburger below it. Reset is
  // present only when a bundled Problem has an Override to revert.
  const actions: HeaderMenuItem[] = [
    { label: "Edit", onClick: () => setEditing(true) },
    ...(canReset ? [{ label: "Reset to original", onClick: handleReset }] : []),
    {
      label: problem.origin === "custom" ? "Archive" : "Hide",
      variant: "danger",
      onClick: handleDelete,
    },
  ];

  return (
    <div className={ui.page}>
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex items-center justify-between gap-4">
          <Link to="/problems" search={search} className={ui.backLink}>
            Library /
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
            <span className="mx-1 h-6 w-0.5 bg-cobalt-700" aria-hidden="true" />
            <AccountControl />
          </div>
        </div>

        <header className="mt-6 mb-10 grid grid-cols-[8px_minmax(0,1fr)] gap-4">
          <div className={DIFFICULTY_FILL[problem.difficulty]} aria-hidden="true" />
          <div>
            <h1 className="font-display text-5xl leading-[0.95] font-black sm:text-6xl">
              {problem.title}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-cobalt-300">
              <span className={`font-semibold capitalize ${DIFFICULTY_COLOR[problem.difficulty]}`}>
                {problem.difficulty}
              </span>
              {problem.origin === "custom" && (
                <span className="rounded-full bg-cobalt-700 px-2 py-0.5 text-xs font-medium text-cobalt-200">
                  Custom
                </span>
              )}
              {problem.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
              {problem.url !== undefined && (
                <a
                  href={problem.url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-pink hover:text-pink-light"
                >
                  View problem source ↗
                </a>
              )}
            </div>
          </div>
        </header>

        {actionError !== null && <p className={`mb-6 ${ui.errorText}`}>{actionError}</p>}

        {problem.statement !== undefined && (
          <section className="mb-10">
            <h2 className={`mb-3 ${ui.sectionHeading}`}>Description</h2>
            <Markdown source={problem.statement} />
          </section>
        )}

        {(problem.expectedTime !== undefined || problem.expectedSpace !== undefined) && (
          <section className="mb-10">
            <h2 className={`mb-3 ${ui.sectionHeading}`}>Requirements</h2>
            {/* Problem-level *targets* the solver should aim for — distinct from
                each Approach's measured complexity shown below. */}
            <div className="flex flex-wrap gap-2 text-sm">
              {problem.expectedTime !== undefined && (
                <span className="rounded-full border-2 border-cobalt-600 px-3.5 py-1">
                  <span className="text-cobalt-300">Target time </span>
                  <span className="font-mono text-paper">{problem.expectedTime}</span>
                </span>
              )}
              {problem.expectedSpace !== undefined && (
                <span className="rounded-full border-2 border-cobalt-600 px-3.5 py-1">
                  <span className="text-cobalt-300">Target space </span>
                  <span className="font-mono text-paper">{problem.expectedSpace}</span>
                </span>
              )}
            </div>
          </section>
        )}

        {problem.examples !== undefined && problem.examples.length > 0 && (
          <section className="mb-10">
            <h2 className={`mb-3 ${ui.sectionHeading}`}>Examples</h2>
            <div className="flex flex-col gap-3">
              {problem.examples.map((example, index) => (
                <div key={index} className="rounded-xl bg-cobalt-850 p-4">
                  <div className="mb-2 text-xs font-semibold text-cobalt-300">
                    Example {index + 1}
                  </div>
                  <dl className="flex flex-col gap-2 text-sm">
                    <div>
                      <dt className="text-xs text-cobalt-400">Input</dt>
                      <dd className="mt-0.5 overflow-auto font-mono whitespace-pre-wrap text-paper">
                        {example.input}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-cobalt-400">Output</dt>
                      <dd className="mt-0.5 overflow-auto font-mono whitespace-pre-wrap text-mint">
                        {example.output}
                      </dd>
                    </div>
                    {example.explanation !== undefined && (
                      <div>
                        <dt className="text-xs text-cobalt-400">Explanation</dt>
                        <dd className="mt-0.5 text-cobalt-200">{example.explanation}</dd>
                      </div>
                    )}
                  </dl>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="mb-10">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className={ui.sectionHeading}>Approaches</h2>
            {session !== null && (
              <button
                type="button"
                onClick={() => void loadBestScores().catch(() => {})}
                className={ui.textButton}
              >
                Refresh PBs
              </button>
            )}
          </div>
          {session !== null && historyStatus === "error" && (
            <p className={`mb-3 ${ui.errorText}`}>
              {historyError ?? "Could not load Personal Bests."}
            </p>
          )}
          <ul className="border-b border-cobalt-700">
            {problem.solutions.map((solution) => {
              const best = bestFor(scopedBestScores, problem.id, solution.id, mode);
              const complexity = complexityLabel(solution);
              const pbPending = sessionPending || (session !== null && historyStatus !== "ready");
              return (
                <li key={solution.id} className="border-t border-cobalt-700">
                  <Link
                    to="/problems/$problemId/$solutionId"
                    params={{ problemId: problem.id, solutionId: solution.id }}
                    search={search}
                    className="flex items-center justify-between gap-4 px-2 py-3 transition-colors duration-100 hover:bg-pink/10"
                  >
                    <div className="min-w-0">
                      <div className="font-display text-2xl leading-tight font-extrabold">
                        {solution.approach}
                      </div>
                      {complexity !== null && (
                        <div className="mt-0.5 text-xs text-cobalt-300">{complexity}</div>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      {pbPending ? (
                        <div className="font-display text-2xl text-cobalt-600">…</div>
                      ) : session === null ? (
                        <div className="text-xs text-cobalt-400">Sign in to track PBs</div>
                      ) : best !== undefined ? (
                        <>
                          <div className="font-display text-3xl leading-none font-black text-lemon tabular-nums">
                            {Math.round(best.bestCpm)}
                          </div>
                          <div className="text-xs text-cobalt-300">
                            {MODE_LABEL[mode]} best, cpm
                          </div>
                        </>
                      ) : (
                        <div className="font-display text-lg font-semibold text-cobalt-600">
                          Not played
                        </div>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        <section>
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className={ui.sectionHeading}>Recent attempts</h2>
            {session !== null && (
              <button
                type="button"
                onClick={() => void loadProblemAttempts()}
                className={ui.textButton}
              >
                Refresh
              </button>
            )}
          </div>
          {sessionPending || attemptStatus === "idle" || attemptStatus === "loading" ? (
            <p className={ui.mutedText}>Loading Attempts…</p>
          ) : session === null ? (
            <p className={ui.mutedText}>Sign in to keep a history of your Attempts.</p>
          ) : attemptStatus === "error" ? (
            <div className="flex items-center gap-3">
              <p className={ui.errorText}>{attemptError ?? "Could not load Attempt history."}</p>
              <button
                type="button"
                onClick={() => void loadProblemAttempts()}
                className={ui.secondaryButton}
              >
                Retry
              </button>
            </div>
          ) : attempts.length === 0 ? (
            <p className={ui.mutedText}>
              No attempts yet. Pick an approach above to start a Session.
            </p>
          ) : (
            <RecentAttempts attempts={attempts} />
          )}
        </section>
      </div>

      {editing && (
        <ProblemDialog initial={problem} onClose={() => setEditing(false)} onSubmit={saveProblem} />
      )}
    </div>
  );
}
