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

/** Scoreboard strip: live CPM is the headline number; the rest ride alongside. */
export function Hud({ metrics, elapsedMs }: HudProps) {
  return (
    <div className="flex items-baseline gap-4 font-display tabular-nums sm:gap-5">
      <div className="flex items-baseline gap-1">
        <span className="text-5xl leading-[0.85] font-black text-lemon">
          {Math.round(metrics.cpm)}
        </span>
        <span className="font-sans text-xs text-cobalt-300">cpm</span>
      </div>
      <Stat label="wpm" value={Math.round(metrics.wpm).toString()} />
      <Stat label="acc" value={`${Math.round(metrics.accuracyPct)}%`} />
      <Stat label="time" value={formatTime(elapsedMs)} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1">
      <span className="text-2xl leading-none font-bold text-paper">{value}</span>
      <span className="font-sans text-xs text-cobalt-300">{label}</span>
    </div>
  );
}
