import { Link } from "@tanstack/react-router";
import { loadAttempts } from "../persistence/storage";

export function Stats() {
  const attempts = loadAttempts();
  const averageAccuracy =
    attempts.length === 0
      ? 0
      : attempts.reduce((total, attempt) => total + attempt.accuracyPct, 0) / attempts.length;
  const bestCpm = attempts.reduce((best, attempt) => Math.max(best, attempt.cpm), 0);
  const totalMinutes = attempts.reduce((total, attempt) => total + attempt.durationMs, 0) / 60_000;

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <Link to="/problems" className="text-sm text-neutral-400 hover:text-neutral-200">
          ← Back to the library
        </Link>
        <header className="mt-4 mb-8">
          <h1 className="text-2xl font-semibold">Stats</h1>
          <p className="mt-1 text-sm text-neutral-500">A summary of completed Sessions.</p>
        </header>
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Attempts" value={attempts.length.toString()} />
          <Stat label="Best CPM" value={Math.round(bestCpm).toString()} />
          <Stat label="Average accuracy" value={`${Math.round(averageAccuracy)}%`} />
        </div>
        <p className="mt-4 text-sm text-neutral-500">
          Practice time: {totalMinutes.toFixed(1)} minutes
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
      <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
