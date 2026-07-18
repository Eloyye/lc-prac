import { afterEach, describe, expect, it, vi } from "vitest";
import type { BestScoreListResponse, StatsSummary } from "@shared/types";
import { getStatsSummary, listBestScores } from "./stats";

afterEach(() => {
  vi.unstubAllGlobals();
});

const summary: StatsSummary = {
  totalAttempts: 2,
  practicedProblemCount: 1,
  averageCpm: 125,
  averageAccuracyPct: 95,
  bestCpm: 150,
  totalPracticeTimeMs: 90_000,
  recentAttempts: [],
};

const scores: BestScoreListResponse = { bestScores: [] };

describe("Stats API", () => {
  it("reads the server summary with optional ownership-scoped filters", async () => {
    const fetchSpy = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(summary), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchSpy);

    await expect(getStatsSummary({ problemId: "two-sum", mode: "copy" })).resolves.toEqual(summary);
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/stats/summary?problemId=two-sum&mode=copy",
      expect.objectContaining({ credentials: "same-origin" }),
    );
  });

  it("reads Mode-specific Personal Bests", async () => {
    const fetchSpy = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(scores), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchSpy);

    await expect(
      listBestScores({ solutionId: "two-sum-hashmap", mode: "recall" }),
    ).resolves.toEqual(scores);
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/stats/best-scores?solutionId=two-sum-hashmap&mode=recall",
      expect.objectContaining({ credentials: "same-origin" }),
    );
  });
});
