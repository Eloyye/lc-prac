import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Problem, Solution } from "@shared/domain/problem";
import { computeMetrics } from "../typing-engine";
import { createAttempt } from "../api/attempts";
import { useSession } from "../store/session";
import { useHistory } from "../store/history";
import { usePreferences } from "../store/preferences";
import { ReferenceEditor } from "../editor/ReferenceEditor";
import { TypingEditor } from "../editor/TypingEditor";
import { Hud } from "./Hud";
import { ProblemStatementPanel } from "./ProblemStatementPanel";
import { Results } from "./Results";
import type { ResultSaveState } from "./Results";

interface SessionViewProps {
  problem: Problem;
  solution: Solution;
  onExit: () => void;
  onNext?: () => void;
}

const MODE_LABEL = { copy: "Copy", recall: "Recall", free: "Free" } as const;

function blocksSessionShortcut(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return (
    target.closest(
      "input, textarea, select, button, a, [contenteditable='true'], .monaco-editor",
    ) !== null
  );
}

export function SessionView({ problem, solution, onExit, onNext }: SessionViewProps) {
  const [attemptKey, setAttemptKey] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [saveState, setSaveState] = useState<ResultSaveState>({ status: "saving" });
  const completedAttemptId = useRef<string | null>(null);
  const previousMode = useRef(usePreferences.getState().mode);

  const mode = usePreferences((s) => s.mode);
  const distractionFree = usePreferences((s) => s.distractionFree);
  const toggleDistractionFree = usePreferences((s) => s.toggleDistractionFree);
  const openPalette = usePreferences((s) => s.openPalette);

  const status = useSession((s) => s.status);
  const startedAt = useSession((s) => s.startedAt);
  const finishedAt = useSession((s) => s.finishedAt);
  const totalKeystrokes = useSession((s) => s.totalKeystrokes);
  const errorKeystrokes = useSession((s) => s.errorKeystrokes);
  const correctChars = useSession((s) => s.correctChars);
  const reset = useSession((s) => s.reset);

  // Clear any state from a previous problem when this view mounts.
  useEffect(() => {
    reset();
  }, [reset]);

  useEffect(() => {
    if (status !== "running") return;
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, [status]);

  // `now` only ticks every 200ms, so right after start it can predate
  // `startedAt`; clamp so the scoreboard never shows negative time.
  const elapsedMs = startedAt === null ? 0 : Math.max(0, (finishedAt ?? now) - startedAt);

  const metrics = useMemo(
    () =>
      computeMetrics({
        correctChars,
        totalKeystrokes,
        errorKeystrokes,
        elapsedMs,
      }),
    [correctChars, totalKeystrokes, errorKeystrokes, elapsedMs],
  );

  const handleComplete = (): void => {
    if (completedAttemptId.current !== null) return;
    const s = useSession.getState();
    const durationMs = (s.finishedAt ?? Date.now()) - (s.startedAt ?? Date.now());
    const final = computeMetrics({
      correctChars: s.correctChars,
      totalKeystrokes: s.totalKeystrokes,
      errorKeystrokes: s.errorKeystrokes,
      elapsedMs: durationMs,
    });
    const attemptId = crypto.randomUUID();
    const historyOwnerUserId = useHistory.getState().ownerUserId;
    completedAttemptId.current = attemptId;
    setSaveState({ status: "saving" });
    void createAttempt({
      id: attemptId,
      problemId: problem.id,
      solutionId: solution.id,
      mode,
      cpm: final.cpm,
      wpm: final.wpm,
      accuracyPct: final.accuracyPct,
      durationMs,
      totalKeystrokes: s.totalKeystrokes,
      errorKeystrokes: s.errorKeystrokes,
      correctChars: s.correctChars,
      createdAt: new Date().toISOString(),
    })
      .then((response) => {
        if (completedAttemptId.current !== attemptId) return;
        useHistory.getState().recordBestScore(response.bestScore, historyOwnerUserId);
        setSaveState({
          status: "saved",
          bestCpm: response.bestScore.bestCpm,
          isPersonalBest: response.isPersonalBest,
        });
      })
      .catch((cause: unknown) => {
        if (completedAttemptId.current !== attemptId) return;
        setSaveState({
          status: "error",
          message: cause instanceof Error ? cause.message : "Please try again later.",
        });
      });
  };

  const handleRetry = useCallback((): void => {
    reset();
    completedAttemptId.current = null;
    setSaveState({ status: "saving" });
    setNow(Date.now());
    setAttemptKey((k) => k + 1);
  }, [reset]);

  const exit = useCallback((): void => {
    reset();
    onExit();
  }, [onExit, reset]);

  const handleNext = useCallback((): void => {
    if (onNext === undefined) return;
    reset();
    onNext();
  }, [onNext, reset]);

  useEffect(() => {
    if (previousMode.current === mode) return;
    previousMode.current = mode;
    handleRetry();
  }, [handleRetry, mode]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
      if (blocksSessionShortcut(event.target)) return;
      if (event.key === "Escape" || event.key === "Tab") {
        event.preventDefault();
        handleRetry();
      } else if (event.key === "Enter" && onNext !== undefined) {
        event.preventDefault();
        handleNext();
      } else if (event.key.toLowerCase() === "l") {
        event.preventDefault();
        exit();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [exit, handleNext, handleRetry, onNext]);

  const progressPct =
    solution.code.length === 0 ? 0 : Math.min(100, (correctChars / solution.code.length) * 100);

  return (
    <div className="flex h-screen flex-col bg-cobalt-900 text-paper">
      <div
        className="h-1.5 shrink-0 bg-cobalt-700"
        role="progressbar"
        aria-label="Reference typed"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progressPct)}
      >
        <div
          className="h-full bg-pink transition-[width] duration-150 ease-out"
          style={{ width: `${progressPct}%` }}
        />
      </div>
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b-2 border-cobalt-700 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={exit}
            className="shrink-0 text-sm font-medium text-cobalt-300 hover:text-paper"
          >
            Library /
          </button>
          <h1 className="truncate font-display text-2xl leading-none font-extrabold">
            {problem.title}
          </h1>
          <span className="hidden truncate text-sm text-cobalt-300 lg:inline">
            {solution.approach}
          </span>
          <span className="shrink-0 rounded-full bg-paper px-2.5 py-0.5 text-xs font-bold text-cobalt-900">
            {MODE_LABEL[mode]}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <Hud metrics={metrics} elapsedMs={elapsedMs} />
          <span className="h-8 w-0.5 bg-cobalt-700" aria-hidden="true" />
          <button
            type="button"
            aria-pressed={distractionFree}
            onClick={toggleDistractionFree}
            className={`rounded-full border-2 px-3 py-1 text-xs font-semibold ${
              distractionFree
                ? "border-mint bg-mint text-mint-ink"
                : "border-cobalt-600 text-cobalt-200 hover:border-cobalt-300 hover:text-paper"
            }`}
          >
            Distraction-free
          </button>
          <button
            type="button"
            onClick={openPalette}
            className="rounded-full border-2 border-cobalt-600 px-3 py-1 text-xs font-semibold text-cobalt-200 hover:border-cobalt-300 hover:text-paper"
          >
            Commands <kbd className="font-sans text-cobalt-400">⌘K</kbd>
          </button>
        </div>
      </header>

      <ProblemStatementPanel statement={problem.statement} url={problem.url} />

      <main className="relative grid flex-1 grid-cols-2 gap-0.5 overflow-hidden bg-cobalt-700">
        <section className="flex flex-col overflow-hidden bg-cobalt-900">
          <h2 className="px-4 py-1.5 text-xs font-semibold text-cobalt-300">Reference</h2>
          <div className="flex-1 overflow-hidden">
            {mode === "copy" ? (
              <ReferenceEditor code={solution.code} />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-1 px-8 text-center">
                <span className="font-display text-3xl font-extrabold text-cobalt-600">Hidden</span>
                <span className="text-sm text-cobalt-400">
                  {MODE_LABEL[mode]} mode hides the Reference. Type it from memory.
                </span>
              </div>
            )}
          </div>
        </section>
        <section className="flex flex-col overflow-hidden bg-cobalt-900">
          <h2 className="px-4 py-1.5 text-xs font-semibold text-pink">Your code</h2>
          <div className="flex-1 overflow-hidden">
            <TypingEditor
              key={attemptKey}
              target={solution.code}
              onComplete={handleComplete}
              distractionFree={distractionFree}
            />
          </div>
        </section>

        {status === "done" && (
          <Results
            metrics={metrics}
            durationMs={elapsedMs}
            saveState={saveState}
            onRetry={handleRetry}
            onExit={exit}
            onNext={onNext === undefined ? undefined : handleNext}
            mode={MODE_LABEL[mode]}
          />
        )}
      </main>

      <footer className="flex flex-wrap gap-x-5 gap-y-1 border-t-2 border-cobalt-700 px-4 py-1.5 text-xs text-cobalt-300">
        <span>Retype the Reference in the right pane. Mistakes turn red, and paste is off.</span>
        <span className="flex gap-3">
          <Shortcut keys="Esc/Tab" action="restart" />
          <Shortcut keys="Enter" action="next" />
          <Shortcut keys="L" action="Library" />
          <Shortcut keys="⌘K" action="commands" />
        </span>
      </footer>
    </div>
  );
}

function Shortcut({ keys, action }: { keys: string; action: string }) {
  return (
    <span>
      <kbd className="rounded bg-cobalt-700 px-1.5 py-0.5 font-sans font-semibold text-paper">
        {keys}
      </kbd>{" "}
      {action}
    </span>
  );
}
