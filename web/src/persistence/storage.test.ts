import { describe, it, expect, beforeEach } from "vitest";
import type { Attempt, Problem } from "@shared/types";
import {
  bestFor,
  clearOverride,
  deleteCustomProblem,
  hasOverride,
  hideBundledProblem,
  loadAttempts,
  loadCustomProblems,
  loadHidden,
  loadOverrides,
  loadSettings,
  localDataImportToken,
  localDataSnapshot,
  hasEligibleLocalData,
  mergedLibrary,
  recentAttemptsForProblem,
  restoreBundledProblem,
  saveAttempt,
  saveCustomProblem,
  saveOverride,
  saveSettings,
} from "./storage";

// The test runtime is `node`, so there is no real localStorage — back it with
// an in-memory Map and reset it before each test.
function createLocalStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => [...store.keys()][index] ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  } as unknown as Storage;
}

function makeProblem(id: string): Problem {
  return {
    id,
    title: `Problem ${id}`,
    difficulty: "easy",
    tags: [],
    origin: "custom",
    solutions: [{ id: `${id}-s`, lang: "python", approach: "x", code: "pass" }],
  };
}

function makeAttempt(
  id: string,
  problemId: string,
  solutionId: string,
  cpm: number,
  createdAt = "2026-06-17T00:00:00.000Z",
): Attempt {
  return {
    id,
    problemId,
    solutionId,
    mode: "copy",
    cpm,
    wpm: cpm / 5,
    accuracyPct: 100,
    durationMs: 1000,
    createdAt,
  };
}

beforeEach(() => {
  globalThis.localStorage = createLocalStorage();
});

describe("deleteCustomProblem", () => {
  it("purges the deleted problem's attempts and best scores", () => {
    saveCustomProblem(makeProblem("p1"));
    saveCustomProblem(makeProblem("p2"));

    saveAttempt(makeAttempt("a1", "p1", "p1-s", 100));
    saveAttempt(makeAttempt("a2", "p1", "p1-s", 200));
    saveAttempt(makeAttempt("a3", "p2", "p2-s", 150));

    // Precondition: p1 has attempts and a derived best score.
    expect(loadAttempts().filter((a) => a.problemId === "p1")).toHaveLength(2);
    expect(bestFor("p1", "p1-s")?.bestCpm).toBe(200);

    deleteCustomProblem("p1");

    // p1's history is gone from both the attempts and best-score stores.
    expect(loadAttempts().some((a) => a.problemId === "p1")).toBe(false);
    expect(bestFor("p1", "p1-s")).toBeUndefined();

    // p2's history is left untouched.
    expect(loadAttempts().map((a) => a.id)).toEqual(["a3"]);
    expect(bestFor("p2", "p2-s")?.bestCpm).toBe(150);
  });
});

describe("saveCustomProblem", () => {
  it("round-trips the statement, target bounds, and examples", () => {
    const problem: Problem = {
      id: "p1",
      title: "Array Sum",
      difficulty: "easy",
      tags: ["array"],
      origin: "custom",
      statement: "Given `nums`, return the **sum**.",
      expectedTime: "O(n)",
      expectedSpace: "O(1)",
      // One example with an explanation, one without — to confirm the optional
      // field survives the round-trip in both shapes.
      examples: [
        { input: "nums = [1, 2]", output: "3", explanation: "1 + 2 = 3." },
        { input: "nums = []", output: "0" },
      ],
      solutions: [{ id: "p1-s", lang: "python", approach: "Loop", code: "pass" }],
    };

    saveCustomProblem(problem);

    expect(loadCustomProblems()).toEqual([problem]);
  });
});

describe("recentAttemptsForProblem", () => {
  it("returns a problem's attempts most-recent-first, capped at the limit", () => {
    saveAttempt(makeAttempt("a1", "p1", "p1-s", 100, "2026-06-01T00:00:00.000Z"));
    saveAttempt(makeAttempt("a2", "p1", "p1-s", 120, "2026-06-03T00:00:00.000Z"));
    saveAttempt(makeAttempt("a3", "p1", "p1-s", 110, "2026-06-02T00:00:00.000Z"));

    // Newest first, regardless of insertion order, and capped at the limit.
    expect(recentAttemptsForProblem("p1", 2).map((a) => a.id)).toEqual(["a2", "a3"]);
  });

  it("excludes other problems' attempts and defaults to the last 5", () => {
    for (let i = 1; i <= 7; i++) {
      const day = String(i).padStart(2, "0");
      saveAttempt(makeAttempt(`a${i}`, "p1", "p1-s", 100, `2026-06-${day}T00:00:00.000Z`));
    }
    saveAttempt(makeAttempt("other", "p2", "p2-s", 100, "2026-06-09T00:00:00.000Z"));

    const recent = recentAttemptsForProblem("p1");
    expect(recent).toHaveLength(5);
    expect(recent.map((a) => a.id)).toEqual(["a7", "a6", "a5", "a4", "a3"]);
    expect(recent.every((a) => a.problemId === "p1")).toBe(true);
  });
});

describe("mode-aware personal bests", () => {
  it("tracks Copy and Recall scores independently", () => {
    saveAttempt(makeAttempt("copy", "p1", "p1-s", 120));
    saveAttempt({ ...makeAttempt("recall", "p1", "p1-s", 90), mode: "recall" });

    expect(bestFor("p1", "p1-s", "copy")?.bestCpm).toBe(120);
    expect(bestFor("p1", "p1-s", "recall")?.bestCpm).toBe(90);
  });
});

describe("settings", () => {
  it("uses defaults and persists mode and distraction-free", () => {
    expect(loadSettings()).toEqual({ mode: "copy", distractionFree: false });
    saveSettings({ mode: "recall", distractionFree: true });
    expect(loadSettings()).toEqual({ mode: "recall", distractionFree: true });
  });
});

describe("local data Import snapshot", () => {
  it("captures every supported collection while omitting local PBs and legacy Settings", () => {
    const custom = makeProblem("custom");
    const override = { ...makeProblem("two-sum"), origin: "bundled" as const };
    saveCustomProblem(custom);
    saveOverride(override);
    hideBundledProblem("two-sum");
    saveAttempt(makeAttempt("attempt", custom.id, custom.solutions[0]!.id, 120));
    localStorage.setItem(
      "ct:settings",
      JSON.stringify({
        mode: "recall",
        distractionFree: true,
        theme: "legacy-dark",
        smoothCaret: true,
        paletteOpen: true,
      }),
    );
    localStorage.setItem(
      "ct:best",
      JSON.stringify([{ problemId: custom.id, solutionId: "custom-s", bestCpm: 9999 }]),
    );

    const snapshot = localDataSnapshot();
    expect(snapshot).toEqual({
      customProblems: [custom],
      overrides: [override],
      tombstones: ["two-sum"],
      attempts: [makeAttempt("attempt", custom.id, custom.solutions[0]!.id, 120)],
      settings: { mode: "recall", distractionFree: true },
    });
    expect(snapshot).not.toHaveProperty("bestScores");
    expect(hasEligibleLocalData(snapshot)).toBe(true);
  });

  it("keeps a stable browser token per account", () => {
    const first = localDataImportToken("account-a");
    expect(localDataImportToken("account-a")).toBe(first);
    expect(localDataImportToken("account-b")).not.toBe(first);
  });
});

describe("problem overrides", () => {
  it("round-trips an override and clears it back to nothing", () => {
    const edited: Problem = { ...makeProblem("two-sum"), title: "Two Sum (edited)" };

    expect(hasOverride("two-sum")).toBe(false);

    saveOverride(edited);
    expect(hasOverride("two-sum")).toBe(true);
    expect(loadOverrides()["two-sum"]).toEqual(edited);

    clearOverride("two-sum");
    expect(hasOverride("two-sum")).toBe(false);
    expect(loadOverrides()).toEqual({});
  });
});

describe("hideBundledProblem", () => {
  it("tombstones the id while retaining its override and history for Restore", () => {
    saveOverride({ ...makeProblem("two-sum"), title: "edited" });
    saveAttempt(makeAttempt("a1", "two-sum", "two-sum-s", 120));
    saveAttempt(makeAttempt("a2", "p2", "p2-s", 150));

    // Precondition: two-sum has an override and a derived best score.
    expect(hasOverride("two-sum")).toBe(true);
    expect(bestFor("two-sum", "two-sum-s")?.bestCpm).toBe(120);

    hideBundledProblem("two-sum");

    expect(loadHidden()).toEqual(["two-sum"]);
    expect(hasOverride("two-sum")).toBe(true);
    expect(loadAttempts().map((a) => a.id)).toEqual(["a1", "a2"]);
    expect(bestFor("two-sum", "two-sum-s")?.bestCpm).toBe(120);
    expect(bestFor("p2", "p2-s")?.bestCpm).toBe(150);

    restoreBundledProblem("two-sum");
    expect(loadHidden()).toEqual([]);
    expect(mergedLibrary([makeProblem("two-sum")])[0]?.title).toBe("edited");
  });

  it("does not duplicate an already-hidden id", () => {
    hideBundledProblem("two-sum");
    hideBundledProblem("two-sum");
    expect(loadHidden()).toEqual(["two-sum"]);
  });
});

describe("mergedLibrary", () => {
  // Stand-ins for the bundled PROBLEMS array; the merge is pure over this arg.
  const bundled = [makeProblem("two-sum"), makeProblem("add-two")];

  it("returns bundled then custom when there are no overrides or tombstones", () => {
    saveCustomProblem(makeProblem("my-custom"));
    expect(mergedLibrary(bundled).map((p) => p.id)).toEqual(["two-sum", "add-two", "my-custom"]);
  });

  it("shadows a bundled problem with its override, leaving siblings untouched", () => {
    saveOverride({ ...makeProblem("two-sum"), title: "Two Sum (edited)" });
    const merged = mergedLibrary(bundled);
    expect(merged.find((p) => p.id === "two-sum")?.title).toBe("Two Sum (edited)");
    expect(merged.find((p) => p.id === "add-two")?.title).toBe("Problem add-two");
  });

  it("filters out a tombstoned bundled problem", () => {
    hideBundledProblem("two-sum");
    expect(mergedLibrary(bundled).map((p) => p.id)).toEqual(["add-two"]);
  });
});
