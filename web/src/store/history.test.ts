import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SavedBestScore } from "@shared/types";

vi.mock("../api/stats", () => ({ listBestScores: vi.fn() }));

import { listBestScores } from "../api/stats";
import { bestFor, useHistory } from "./history";

const copy: SavedBestScore = {
  problemId: "two-sum",
  solutionId: "two-sum-hashmap",
  mode: "copy",
  bestCpm: 120,
  bestAccuracyPct: 95,
  bestDurationMs: 10_000,
  attemptId: "copy-attempt",
  updatedAt: "2026-07-17T10:00:00.000Z",
};
const recall: SavedBestScore = {
  ...copy,
  mode: "recall",
  bestCpm: 80,
  attemptId: "recall-attempt",
};

beforeEach(() => {
  vi.mocked(listBestScores).mockReset();
  useHistory.getState().reset();
});

describe("account history store", () => {
  it("clears the previous account's PBs when the authenticated owner changes", () => {
    useHistory.getState().reset("user-a");
    useHistory.setState({ bestScores: [copy], status: "ready" });

    useHistory.getState().reset("user-b");

    expect(useHistory.getState()).toMatchObject({
      ownerUserId: "user-b",
      bestScores: [],
      status: "idle",
    });
  });

  it("loads only API Personal Bests and keeps Modes separate", async () => {
    vi.mocked(listBestScores).mockResolvedValue({ bestScores: [copy, recall] });

    await useHistory.getState().load();

    const state = useHistory.getState();
    expect(state.status).toBe("ready");
    expect(bestFor(state.bestScores, copy.problemId, copy.solutionId, "copy")).toEqual(copy);
    expect(bestFor(state.bestScores, copy.problemId, copy.solutionId, "recall")).toEqual(recall);
    expect(bestFor(state.bestScores, copy.problemId, copy.solutionId, "free")).toBeUndefined();
  });

  it("surfaces load errors and can refresh successfully", async () => {
    vi.mocked(listBestScores)
      .mockRejectedValueOnce(new Error("history unavailable"))
      .mockResolvedValueOnce({ bestScores: [copy] });

    await expect(useHistory.getState().load()).rejects.toThrow("history unavailable");
    expect(useHistory.getState()).toMatchObject({
      status: "error",
      error: "history unavailable",
      bestScores: [],
    });

    await useHistory.getState().load();
    expect(useHistory.getState()).toMatchObject({ status: "ready", error: null });
  });

  it("merges an authoritative PB returned by a completed Session", () => {
    useHistory.setState({ ownerUserId: "user-a", bestScores: [copy, recall], status: "ready" });
    const fasterCopy = { ...copy, bestCpm: 180, attemptId: "faster-copy" };

    useHistory.getState().recordBestScore(fasterCopy, "user-a");

    expect(useHistory.getState().bestScores).toEqual([recall, fasterCopy]);
  });

  it("ignores a late Attempt response after the account changes", () => {
    useHistory.getState().reset("user-b");

    useHistory.getState().recordBestScore(copy, "user-a");

    expect(useHistory.getState().bestScores).toEqual([]);
  });
});
