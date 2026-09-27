import type { StatsSummary } from "@shared/api/stats";

export function StatsSummaryView({ summary }: { summary: StatsSummary }) {
  return (
    <>
      {summary.totalAttempts === 0 && (
        <p className="mb-4 text-sm text-cobalt-300">
          No completed Sessions yet. Finish one to start your Stats.
        </p>
      )}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-cobalt-700 lg:grid-cols-4">
        <Stat label="Attempts" value={summary.totalAttempts.toString()} />
        <Stat label="Best CPM" value={Math.round(summary.bestCpm).toString()} score />
        <Stat label="Average accuracy" value={`${Math.round(summary.averageAccuracyPct)}%`} />
        <Stat
          label="Practice time"
          value={`${(summary.totalPracticeTimeMs / 60_000).toFixed(1)} min`}
        />
      </div>
    </>
  );
}

function Stat({ label, value, score = false }: { label: string; value: string; score?: boolean }) {
  return (
    <div className="bg-cobalt-850 p-4">
      <div
        className={`font-display text-4xl leading-none font-black tabular-nums sm:text-5xl ${score ? "text-lemon" : "text-paper"}`}
      >
        {value}
      </div>
      <div className="mt-1.5 text-xs font-medium text-cobalt-300">{label}</div>
    </div>
  );
}
