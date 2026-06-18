import { useEffect, useRef } from "react";
import type { Metrics } from "../typing-engine";

interface ResultsProps {
  metrics: Metrics;
  durationMs: number;
  bestCpm: number | null;
  isNewBest: boolean;
  onRetry: () => void;
  onExit: () => void;
  onNext?: () => void;
  mode: string;
}

export function Results({
  metrics,
  durationMs,
  bestCpm,
  isNewBest,
  onRetry,
  onExit,
  onNext,
  mode,
}: ResultsProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    overlayRef.current?.focus();
  }, []);

  return (
    <div
      ref={overlayRef}
      tabIndex={-1}
      className="absolute inset-0 z-10 flex items-center justify-center bg-black/70 outline-none backdrop-blur-sm"
    >
      <div className="w-96 rounded-xl border border-neutral-700 bg-neutral-900 p-6 text-center shadow-xl">
        <h2 className="mb-4 text-lg font-semibold text-neutral-100">
          Complete{isNewBest ? " · New best!" : ""}
        </h2>
        <p className="mb-3 text-xs uppercase tracking-wide text-neutral-500">{mode} mode</p>
        <div className="mb-5 grid grid-cols-2 gap-3 text-left">
          <Metric label="WPM" value={Math.round(metrics.wpm)} />
          <Metric label="CPM" value={Math.round(metrics.cpm)} />
          <Metric label="Accuracy" value={`${Math.round(metrics.accuracyPct)}%`} />
          <Metric label="Time" value={`${(durationMs / 1000).toFixed(1)}s`} />
        </div>
        {bestCpm !== null && (
          <p className="mb-4 text-xs text-neutral-500">Best CPM: {Math.round(bestCpm)}</p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onExit}
            className="flex-1 rounded-lg border border-neutral-700 py-2 text-sm font-medium text-neutral-300 hover:bg-neutral-800"
          >
            Library <kbd className="ml-1 text-xs text-neutral-500">L</kbd>
          </button>
          <button
            type="button"
            onClick={onRetry}
            className="flex-1 rounded-lg bg-emerald-600 py-2 text-sm font-medium text-white hover:bg-emerald-500"
          >
            Retry <kbd className="ml-1 text-xs text-emerald-100">Esc/Tab</kbd>
          </button>
          {onNext !== undefined && (
            <button
              type="button"
              onClick={onNext}
              className="flex-1 rounded-lg bg-emerald-600 py-2 text-sm font-medium text-white hover:bg-emerald-500"
            >
              Next <kbd className="ml-1 text-xs text-emerald-100">Enter</kbd>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-neutral-800 px-3 py-2">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="text-lg font-semibold tabular-nums text-neutral-100">{value}</div>
    </div>
  );
}
