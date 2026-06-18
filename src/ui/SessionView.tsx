import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Problem, Solution } from "../types";
import { computeMetrics } from "../typing-engine";
import { useSession } from "../store/session";
import { usePreferences } from "../store/preferences";
import { bestFor, saveAttempt } from "../persistence/storage";
import { ReferenceEditor } from "../editor/ReferenceEditor";
import { TypingEditor } from "../editor/TypingEditor";
import { Hud } from "./Hud";
import { ProblemStatementPanel } from "./ProblemStatementPanel";
import { Results } from "./Results";

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
  const [savedBest, setSavedBest] = useState<number | null>(null);
  const [isNewBest, setIsNewBest] = useState(false);
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

  const elapsedMs = startedAt === null ? 0 : (finishedAt ?? now) - startedAt;

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
    const s = useSession.getState();
    const durationMs = (s.finishedAt ?? Date.now()) - (s.startedAt ?? Date.now());
    const final = computeMetrics({
      correctChars: s.correctChars,
      totalKeystrokes: s.totalKeystrokes,
      errorKeystrokes: s.errorKeystrokes,
      elapsedMs: durationMs,
    });
    const previousBest = bestFor(problem.id, solution.id, mode)?.bestCpm ?? null;
    saveAttempt({
      id: crypto.randomUUID(),
      problemId: problem.id,
      solutionId: solution.id,
      mode,
      cpm: final.cpm,
      wpm: final.wpm,
      accuracyPct: final.accuracyPct,
      durationMs,
      createdAt: new Date().toISOString(),
    });
    setSavedBest(previousBest === null ? final.cpm : Math.max(previousBest, final.cpm));
    setIsNewBest(previousBest === null || final.cpm > previousBest);
  };

  const handleRetry = useCallback((): void => {
    reset();
    setSavedBest(null);
    setIsNewBest(false);
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

  return (
    <div className="flex h-screen flex-col bg-neutral-950 text-neutral-100">
      <header className="flex items-center justify-between border-b border-neutral-800 px-4 py-2">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={exit}
            className="rounded px-2 py-1 text-sm text-neutral-400 hover:bg-neutral-800 hover:text-white"
          >
            ← Library
          </button>
          <span className="font-semibold">CodeType</span>
          <span className="text-sm text-neutral-400">{problem.title}</span>
          <span className="text-xs text-neutral-500">{solution.approach}</span>
          <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-xs text-neutral-400">
            {MODE_LABEL[mode]}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-pressed={distractionFree}
            onClick={toggleDistractionFree}
            className={`rounded border px-2 py-1 text-xs ${
              distractionFree
                ? "border-emerald-600 bg-emerald-950 text-emerald-300"
                : "border-neutral-700 text-neutral-400 hover:bg-neutral-800 hover:text-white"
            }`}
          >
            Distraction-free
          </button>
          <button
            type="button"
            onClick={openPalette}
            className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-white"
          >
            Commands <kbd className="font-mono">⌘K</kbd>
          </button>
          <Hud metrics={metrics} elapsedMs={elapsedMs} />
        </div>
      </header>

      <ProblemStatementPanel statement={problem.statement} url={problem.url} />

      <main className="relative grid flex-1 grid-cols-2 gap-px overflow-hidden bg-neutral-800">
        <section className="flex flex-col overflow-hidden bg-neutral-950">
          <div className="px-3 py-1 text-xs uppercase tracking-wide text-neutral-500">
            Reference
          </div>
          <div className="flex-1 overflow-hidden">
            {mode === "copy" ? (
              <ReferenceEditor code={solution.code} />
            ) : (
              <div className="flex h-full items-center justify-center px-8 text-center text-sm text-neutral-600">
                Reference hidden in {MODE_LABEL[mode]} mode.
              </div>
            )}
          </div>
        </section>
        <section className="flex flex-col overflow-hidden bg-neutral-950">
          <div className="px-3 py-1 text-xs uppercase tracking-wide text-neutral-500">
            Your code
          </div>
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
            bestCpm={savedBest}
            isNewBest={isNewBest}
            onRetry={handleRetry}
            onExit={exit}
            onNext={onNext === undefined ? undefined : handleNext}
            mode={MODE_LABEL[mode]}
          />
        )}
      </main>

      <footer className="border-t border-neutral-800 px-4 py-1.5 text-xs text-neutral-500">
        <span>Retype the Reference on the right. Mistakes turn red; paste is disabled.</span>
        <span className="ml-4">
          <kbd>Esc/Tab</kbd> restart · <kbd>Enter</kbd> next · <kbd>L</kbd> Library · <kbd>⌘K</kbd>{" "}
          commands
        </span>
      </footer>
    </div>
  );
}
