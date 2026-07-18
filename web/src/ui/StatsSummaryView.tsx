import type { StatsSummary } from "@shared/types";

export function StatsSummaryView({ summary }: { summary: StatsSummary }) {
  return (
    <>
      {summary.totalAttempts === 0 && (
        <p className="mb-4 text-sm text-neutral-500">
          No completed Sessions yet. Finish one to start your Stats.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Attempts" value={summary.totalAttempts.toString()} />
        <Stat label="Best CPM" value={Math.round(summary.bestCpm).toString()} />
        <Stat label="Average accuracy" value={`${Math.round(summary.averageAccuracyPct)}%`} />
        <Stat
          label="Practice time"
          value={`${(summary.totalPracticeTimeMs / 60_000).toFixed(1)} min`}
        />
      </div>
    </>
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
