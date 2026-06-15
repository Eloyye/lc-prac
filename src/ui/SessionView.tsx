import { useEffect, useMemo, useState } from "react";
import type { Problem, Solution } from "../types";
import { computeMetrics } from "../typing-engine";
import { useSession } from "../store/session";
import { bestFor, saveAttempt } from "../persistence/storage";
import { ReferenceEditor } from "../editor/ReferenceEditor";
import { TypingEditor } from "../editor/TypingEditor";
import { Hud } from "./Hud";
import { Results } from "./Results";

interface SessionViewProps {
  problem: Problem;
  solution: Solution;
}

export function SessionView({ problem, solution }: SessionViewProps) {
  const [attemptKey, setAttemptKey] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [savedBest, setSavedBest] = useState<number | null>(null);
  const [isNewBest, setIsNewBest] = useState(false);

  const status = useSession((s) => s.status);
  const startedAt = useSession((s) => s.startedAt);
  const finishedAt = useSession((s) => s.finishedAt);
  const totalKeystrokes = useSession((s) => s.totalKeystrokes);
  const errorKeystrokes = useSession((s) => s.errorKeystrokes);
  const correctChars = useSession((s) => s.correctChars);
  const reset = useSession((s) => s.reset);

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
    const previousBest = bestFor(problem.id, solution.id)?.bestCpm ?? null;
    saveAttempt({
      id: crypto.randomUUID(),
      problemId: problem.id,
      solutionId: solution.id,
      mode: "copy",
      cpm: final.cpm,
      wpm: final.wpm,
      accuracyPct: final.accuracyPct,
      durationMs,
      createdAt: new Date().toISOString(),
    });
    setSavedBest(previousBest === null ? final.cpm : Math.max(previousBest, final.cpm));
    setIsNewBest(previousBest === null || final.cpm > previousBest);
  };

  const handleRetry = (): void => {
    reset();
    setSavedBest(null);
    setIsNewBest(false);
    setNow(Date.now());
    setAttemptKey((k) => k + 1);
  };

  return (
    <div className="flex h-screen flex-col bg-neutral-950 text-neutral-100">
      <header className="flex items-center justify-between border-b border-neutral-800 px-4 py-2">
        <div className="flex items-baseline gap-3">
          <span className="font-semibold">CodeType</span>
          <span className="text-sm text-neutral-400">{problem.title}</span>
          <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-xs uppercase text-neutral-400">
            {problem.difficulty}
          </span>
        </div>
        <Hud metrics={metrics} elapsedMs={elapsedMs} />
      </header>

      <main className="relative grid flex-1 grid-cols-2 gap-px overflow-hidden bg-neutral-800">
        <section className="flex flex-col overflow-hidden bg-neutral-950">
          <div className="px-3 py-1 text-xs uppercase tracking-wide text-neutral-500">
            Reference
          </div>
          <div className="flex-1 overflow-hidden">
            <ReferenceEditor code={solution.code} />
          </div>
        </section>
        <section className="flex flex-col overflow-hidden bg-neutral-950">
          <div className="px-3 py-1 text-xs uppercase tracking-wide text-neutral-500">
            Your code
          </div>
          <div className="flex-1 overflow-hidden">
            <TypingEditor key={attemptKey} target={solution.code} onComplete={handleComplete} />
          </div>
        </section>

        {status === "done" && (
          <Results
            metrics={metrics}
            durationMs={elapsedMs}
            bestCpm={savedBest}
            isNewBest={isNewBest}
            onRetry={handleRetry}
          />
        )}
      </main>

      <footer className="border-t border-neutral-800 px-4 py-1.5 text-xs text-neutral-500">
        Retype the reference on the right. Mistakes turn red — fix them to finish. Enter
        auto-indents; paste is disabled.
      </footer>
    </div>
  );
}
