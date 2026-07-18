import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SavedAttempt } from "@shared/types";
import { RecentAttempts } from "./RecentAttempts";

describe("RecentAttempts", () => {
  it("renders the immutable Solution approach snapshot after current content changes", () => {
    const attempt: SavedAttempt = {
      id: "snapshot-attempt",
      problemId: "two-sum",
      solutionId: "removed-solution",
      problemTitle: "Old Problem title",
      solutionApproach: "Original snapshot approach",
      mode: "recall",
      cpm: 123,
      wpm: 24.6,
      accuracyPct: 97,
      durationMs: 20_000,
      totalKeystrokes: 100,
      errorKeystrokes: 3,
      correctChars: 90,
      createdAt: "2026-07-17T12:00:00.000Z",
    };

    const html = renderToStaticMarkup(<RecentAttempts attempts={[attempt]} />);

    expect(html).toContain("Original snapshot approach");
    expect(html).toContain("Recall");
    expect(html).toContain("123 CPM");
    expect(html).not.toContain("Removed approach");
  });
});
