import type { Metrics } from "../typing-engine";

interface HudProps {
  metrics: Metrics;
  elapsedMs: number;
}

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function Hud({ metrics, elapsedMs }: HudProps) {
  return (
    <div className="flex gap-6 tabular-nums">
      <Stat label="WPM" value={Math.round(metrics.wpm).toString()} />
      <Stat label="CPM" value={Math.round(metrics.cpm).toString()} />
      <Stat label="ACC" value={`${Math.round(metrics.accuracyPct)}%`} />
      <Stat label="TIME" value={formatTime(elapsedMs)} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-xs uppercase tracking-wide text-neutral-500">{label}</span>
      <span className="text-base font-semibold text-neutral-100">{value}</span>
    </div>
  );
}
