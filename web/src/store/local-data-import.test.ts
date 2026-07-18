import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Attempt, LocalDataImportReport, Problem } from "@shared/types";
import {
  hideBundledProblem,
  saveAttempt,
  saveCustomProblem,
  saveOverride,
} from "../persistence/storage";
import { useLocalDataImport } from "./local-data-import";

function createLocalStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key) => store.get(key) ?? null,
    key: (index) => [...store.keys()][index] ?? null,
    removeItem: (key) => {
      store.delete(key);
    },
    setItem: (key, value) => {
      store.set(key, value);
    },
  } as Storage;
}

function problem(id: string, origin: Problem["origin"]): Problem {
  return {
    id,
    title: id,
    difficulty: "easy",
    tags: [],
    origin,
    solutions: [{ id: `${id}-solution`, lang: "python", approach: "Local", code: "pass" }],
  };
}

function attempt(problemId: string): Attempt {
  return {
    id: "local-attempt",
    problemId,
    solutionId: `${problemId}-solution`,
    mode: "copy",
    cpm: 120,
    wpm: 24,
    accuracyPct: 100,
    durationMs: 1_000,
    createdAt: "2026-07-18T00:00:00.000Z",
  };
}

const importedReport: LocalDataImportReport = {
  decision: "imported",
  imported: { customProblems: 1, overrides: 1, tombstones: 1, attempts: 1, settings: 1 },
  skipped: [{ collection: "attempts", id: "server-attempt", reason: "conflict" }],
  completedAt: "2026-07-18T00:00:00.000Z",
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.unstubAllGlobals();
  globalThis.localStorage = createLocalStorage();
  useLocalDataImport.getState().reset();
});

describe("local data Import ownership", () => {
  it("offers and submits every supported collection with only supported Settings", async () => {
    const custom = problem("custom", "custom");
    saveCustomProblem(custom);
    saveOverride(problem("two-sum", "bundled"));
    hideBundledProblem("contains-duplicate");
    saveAttempt(attempt(custom.id));
    localStorage.setItem(
      "ct:settings",
      JSON.stringify({ mode: "recall", distractionFree: true, theme: "legacy" }),
    );
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(response({ status: "pending" }))
      .mockResolvedValueOnce(response({ report: importedReport, replayed: false }, 201));
    vi.stubGlobal("fetch", fetchSpy);

    await expect(useLocalDataImport.getState().check("account-a")).resolves.toBe(true);
    expect(useLocalDataImport.getState().status).toBe("prompt");
    await expect(useLocalDataImport.getState().submitImport()).resolves.toBe(true);
    expect(useLocalDataImport.getState()).toMatchObject({
      status: "result",
      report: importedReport,
    });

    const requestBody = JSON.parse(
      (fetchSpy.mock.calls[1]![1] as RequestInit).body as string,
    ) as Record<string, unknown>;
    expect(requestBody).toMatchObject({
      action: "import",
      customProblems: [custom],
      overrides: [{ id: "two-sum" }],
      tombstones: ["contains-duplicate"],
      attempts: [{ id: "local-attempt" }],
      settings: { mode: "recall", distractionFree: true },
    });
    expect(requestBody).not.toHaveProperty("bestScores");
    expect(requestBody).not.toHaveProperty("theme");
  });

  it("reuses the same token when retrying after a failed submission", async () => {
    saveCustomProblem(problem("custom", "custom"));
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(response({ status: "pending" }))
      .mockResolvedValueOnce(response({ error: { code: "INTERNAL", message: "Try again" } }, 500))
      .mockResolvedValueOnce(response({ report: importedReport, replayed: true }));
    vi.stubGlobal("fetch", fetchSpy);

    await useLocalDataImport.getState().check("account-a");
    await expect(useLocalDataImport.getState().submitImport()).resolves.toBe(false);
    expect(useLocalDataImport.getState()).toMatchObject({
      status: "error",
      failedAction: "import",
    });
    await expect(useLocalDataImport.getState().submitImport()).resolves.toBe(true);

    const first = JSON.parse((fetchSpy.mock.calls[1]![1] as RequestInit).body as string) as {
      idempotencyToken: string;
    };
    const retry = JSON.parse((fetchSpy.mock.calls[2]![1] as RequestInit).body as string) as {
      idempotencyToken: string;
    };
    expect(retry.idempotencyToken).toBe(first.idempotencyToken);
    expect(useLocalDataImport.getState().report).toEqual(importedReport);
  });

  it("submits an explicit skip and does not prompt when there is no eligible data", async () => {
    const noDataFetch = vi.fn();
    vi.stubGlobal("fetch", noDataFetch);
    await expect(useLocalDataImport.getState().check("empty-account")).resolves.toBe(false);
    expect(noDataFetch).not.toHaveBeenCalled();

    saveCustomProblem(problem("custom", "custom"));
    const skippedReport: LocalDataImportReport = {
      ...importedReport,
      decision: "skipped",
      imported: { customProblems: 0, overrides: 0, tombstones: 0, attempts: 0, settings: 0 },
      skipped: [],
    };
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(response({ status: "pending" }))
      .mockResolvedValueOnce(response({ report: skippedReport, replayed: false }, 201));
    vi.stubGlobal("fetch", fetchSpy);
    await useLocalDataImport.getState().check("account-a");
    await expect(useLocalDataImport.getState().submitSkip()).resolves.toBe(true);

    expect(JSON.parse((fetchSpy.mock.calls[1]![1] as RequestInit).body as string)).toMatchObject({
      action: "skip",
      idempotencyToken: expect.any(String),
    });
    expect(useLocalDataImport.getState().report).toEqual(skippedReport);
  });
});
