import type { Mode, SavedAttempt } from "@shared/types";

const MODE_LABEL: Record<Mode, string> = {
  copy: "Copy",
  recall: "Recall",
  free: "Free",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Snapshot-only history rendering: current Problem content is never consulted. */
export function RecentAttempts({ attempts }: { attempts: SavedAttempt[] }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {attempts.map((attempt) => (
        <li
          key={attempt.id}
          className="flex items-center justify-between gap-4 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-sm"
        >
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-neutral-200">{attempt.solutionApproach}</span>
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
  );
}
