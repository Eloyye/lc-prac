export interface Metrics {
  cpm: number;
  wpm: number;
  accuracyPct: number;
}

export interface MetricsInput {
  /** Characters currently typed correctly. */
  correctChars: number;
  /** Printable keys pressed (corrections included). */
  totalKeystrokes: number;
  /** Printable keys that did not match the expected character. */
  errorKeystrokes: number;
  elapsedMs: number;
}

export function computeMetrics({
  correctChars,
  totalKeystrokes,
  errorKeystrokes,
  elapsedMs,
}: MetricsInput): Metrics {
  const minutes = elapsedMs / 60_000;
  const cpm = minutes > 0 ? correctChars / minutes : 0;
  const wpm = cpm / 5;
  const accuracyPct =
    totalKeystrokes > 0 ? ((totalKeystrokes - errorKeystrokes) / totalKeystrokes) * 100 : 100;
  return { cpm, wpm, accuracyPct };
}
