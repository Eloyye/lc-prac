import { describe, it, expect, beforeEach } from "vitest";
import type { Attempt, Problem } from "../types";
import {
  bestFor,
  deleteCustomProblem,
  loadAttempts,
  saveAttempt,
  saveCustomProblem,
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

function makeAttempt(id: string, problemId: string, solutionId: string, cpm: number): Attempt {
  return {
    id,
    problemId,
    solutionId,
    mode: "copy",
    cpm,
    wpm: cpm / 5,
    accuracyPct: 100,
    durationMs: 1000,
    createdAt: "2026-06-17T00:00:00.000Z",
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
