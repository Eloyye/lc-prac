import type { SavedAttempt } from "@shared/domain/attempt";
import type { Mode } from "@shared/domain/mode";

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
    <ul className="border-b border-cobalt-700">
      {attempts.map((attempt) => (
        <li
          key={attempt.id}
          className="flex items-center justify-between gap-4 border-t border-cobalt-700 px-2 py-2.5 text-sm"
        >
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate font-medium text-paper">{attempt.solutionApproach}</span>
            <span className="shrink-0 rounded-full bg-cobalt-700 px-2 py-0.5 text-xs font-medium text-cobalt-200">
              {MODE_LABEL[attempt.mode]}
            </span>
          </div>
          <div className="flex shrink-0 items-baseline gap-4">
            <span className="font-display text-xl font-extrabold text-paper tabular-nums">
              {Math.round(attempt.cpm)} CPM
            </span>
            <span className="text-xs text-cobalt-300 tabular-nums">
              {Math.round(attempt.accuracyPct)}%
            </span>
            <span className="w-12 text-right text-xs text-cobalt-400">
              {formatDate(attempt.createdAt)}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
