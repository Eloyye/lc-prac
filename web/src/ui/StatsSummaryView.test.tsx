import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { StatsSummary } from "@shared/types";
import { StatsSummaryView } from "./StatsSummaryView";

function summary(overrides: Partial<StatsSummary> = {}): StatsSummary {
  return {
    totalAttempts: 12,
    practicedProblemCount: 4,
    averageCpm: 111.5,
    averageAccuracyPct: 96.6,
    bestCpm: 180.4,
    totalPracticeTimeMs: 90_000,
    recentAttempts: [],
    ...overrides,
  };
}

describe("StatsSummaryView", () => {
  it("renders the server aggregate values", () => {
    const html = renderToStaticMarkup(<StatsSummaryView summary={summary()} />);

    expect(html).toContain("Attempts");
    expect(html).toContain(">12<");
    expect(html).toContain("Best CPM");
    expect(html).toContain(">180<");
    expect(html).toContain("97%");
    expect(html).toContain("1.5 min");
  });

  it("renders an explicit empty state from a zero-valued server summary", () => {
    const html = renderToStaticMarkup(
      <StatsSummaryView
        summary={summary({
          totalAttempts: 0,
          practicedProblemCount: 0,
          averageCpm: 0,
          averageAccuracyPct: 0,
          bestCpm: 0,
          totalPracticeTimeMs: 0,
        })}
      />,
    );

    expect(html).toContain("No completed Sessions yet");
  });
});
