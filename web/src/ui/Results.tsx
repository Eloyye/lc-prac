import { useEffect, useRef } from "react";
import type { Metrics } from "../typing-engine";

export type ResultSaveState =
  | { status: "saving" }
  | { status: "saved"; bestCpm: number; isPersonalBest: boolean }
  | { status: "error"; message: string };

interface ResultsProps {
  metrics: Metrics;
  durationMs: number;
  saveState: ResultSaveState;
  onRetry: () => void;
  onExit: () => void;
  onNext?: () => void;
  mode: string;
}

export function Results({
  metrics,
  durationMs,
  saveState,
  onRetry,
  onExit,
  onNext,
  mode,
}: ResultsProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    overlayRef.current?.focus();
  }, []);

  const isPersonalBest = saveState.status === "saved" && saveState.isPersonalBest;

  return (
    <div
      ref={overlayRef}
      tabIndex={-1}
      className="absolute inset-0 z-10 flex items-center justify-center bg-cobalt-950/75 p-4 outline-none backdrop-blur-sm"
    >
      <div className="results-card relative w-full max-w-sm rounded-lg border-4 border-pink bg-paper p-6 text-cobalt-900 shadow-2xl shadow-cobalt-950">
        {isPersonalBest && (
          <div className="results-stamp absolute -top-4 -right-4 rounded bg-lemon px-3 py-1.5 font-display text-xl font-black text-lemon-ink shadow-lg">
            New best!
          </div>
        )}
        <h2 className="text-sm font-semibold">Complete</h2>
        <p className="text-xs text-cobalt-600">{mode} mode</p>
        <div className="mt-2 flex items-baseline gap-2 font-display tabular-nums">
          <span className="text-8xl leading-[0.85] font-black">{Math.round(metrics.cpm)}</span>
          <span className="text-2xl font-bold">CPM</span>
        </div>
        <div className="mt-4 mb-4 grid grid-cols-3 gap-2 border-y-2 border-cobalt-900/10 py-3">
          <Metric label="WPM" value={Math.round(metrics.wpm)} />
          <Metric label="Accuracy" value={`${Math.round(metrics.accuracyPct)}%`} />
          <Metric label="Time" value={`${(durationMs / 1000).toFixed(1)}s`} />
        </div>
        <SaveStatus state={saveState} />
        <div className="flex gap-2">
          {onNext !== undefined && (
            <button type="button" onClick={onNext} className={primaryButton}>
              Next <kbd className="ml-1 font-sans text-xs opacity-70">Enter</kbd>
            </button>
          )}
          <button
            type="button"
            onClick={onRetry}
            className={onNext === undefined ? primaryButton : secondaryButton}
          >
            Retry <kbd className="ml-1 font-sans text-xs opacity-70">Esc/Tab</kbd>
          </button>
          <button type="button" onClick={onExit} className={secondaryButton}>
            Library <kbd className="ml-1 font-sans text-xs opacity-70">L</kbd>
          </button>
        </div>
      </div>
    </div>
  );
}

const primaryButton =
  "flex-1 rounded-full bg-pink py-2 text-sm font-bold text-pink-ink hover:bg-pink-light";
const secondaryButton =
  "flex-1 rounded-full border-2 border-cobalt-900 py-1.5 text-sm font-bold text-cobalt-900 hover:bg-cobalt-900 hover:text-paper";

function SaveStatus({ state }: { state: ResultSaveState }) {
  if (state.status === "saving") {
    return (
      <p aria-live="polite" className="mb-4 text-xs text-cobalt-600">
        Saving result…
      </p>
    );
  }
  if (state.status === "error") {
    return (
      <p aria-live="polite" className="mb-4 text-xs font-medium text-tomato-ink">
        Result not saved. {state.message}
      </p>
    );
  }
  return (
    <p aria-live="polite" className="mb-4 text-xs text-cobalt-600">
      Saved · Best CPM: {Math.round(state.bestCpm)}
    </p>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="font-display text-3xl leading-none font-extrabold tabular-nums">{value}</div>
      <div className="mt-0.5 text-xs text-cobalt-600">{label}</div>
    </div>
  );
}
