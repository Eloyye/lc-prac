import { afterEach, describe, expect, it, vi } from "vitest";
import type { CreateAttemptResponse } from "@shared/types";
import { createAttempt } from "./attempts";

const input = {
  id: "attempt-1",
  problemId: "two-sum",
  solutionId: "two-sum-hashmap",
  mode: "copy" as const,
  cpm: 120,
  wpm: 24,
  accuracyPct: 98,
  durationMs: 10_000,
  totalKeystrokes: 200,
  errorKeystrokes: 4,
  correctChars: 180,
  errorMap: { "x@12": 1 },
  createdAt: "2026-07-17T12:00:00.000Z",
};

const response: CreateAttemptResponse = {
  attempt: {
    ...input,
    problemTitle: "Two Sum",
    solutionApproach: "Hash map",
  },
  bestScore: {
    problemId: input.problemId,
    solutionId: input.solutionId,
    mode: input.mode,
    bestCpm: input.cpm,
    bestAccuracyPct: input.accuracyPct,
    bestDurationMs: input.durationMs,
    attemptId: input.id,
    updatedAt: input.createdAt,
  },
  isPersonalBest: true,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createAttempt", () => {
  it("POSTs the complete client-owned metrics payload and returns API PB state", async () => {
    const fetchSpy = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(response), {
          status: 201,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchSpy);

    await expect(createAttempt(input)).resolves.toEqual(response);
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/attempts",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        body: JSON.stringify(input),
      }),
    );
  });

  it("rejects a failed save without mutating the completed input", async () => {
    const before = structuredClone(input);
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({ error: { code: "INTERNAL", message: "Save unavailable." } }),
            { status: 500, headers: { "content-type": "application/json" } },
          ),
        ),
      ),
    );

    await expect(createAttempt(input)).rejects.toMatchObject({
      status: 500,
      code: "INTERNAL",
      message: "Save unavailable.",
    });
    expect(input).toEqual(before);
  });
});
