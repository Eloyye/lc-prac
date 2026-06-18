import { describe, it, expect } from "vitest";
import { computeMetrics } from "./metrics";

describe("computeMetrics", () => {
  it("reports zero speed and full accuracy before time elapses", () => {
    const m = computeMetrics({
      correctChars: 0,
      totalKeystrokes: 0,
      errorKeystrokes: 0,
      elapsedMs: 0,
    });
    expect(m.cpm).toBe(0);
    expect(m.wpm).toBe(0);
    expect(m.accuracyPct).toBe(100);
  });

  it("derives cpm and wpm from correct characters over time", () => {
    const m = computeMetrics({
      correctChars: 300,
      totalKeystrokes: 300,
      errorKeystrokes: 0,
      elapsedMs: 60_000,
    });
    expect(m.cpm).toBe(300);
    expect(m.wpm).toBe(60);
  });

  it("derives accuracy from error keystrokes", () => {
    const m = computeMetrics({
      correctChars: 90,
      totalKeystrokes: 100,
      errorKeystrokes: 10,
      elapsedMs: 60_000,
    });
    expect(m.accuracyPct).toBe(90);
  });
});
