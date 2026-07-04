import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Problem } from "@shared/types";
import type { ProblemListResponse } from "../api/problems";

vi.mock("../api/problems", () => ({
  listProblems: vi.fn(),
  updateBundledProblem: vi.fn(),
  hideBundledProblem: vi.fn(),
  restoreBundledProblem: vi.fn(),
  resetBundledProblem: vi.fn(),
}));

import {
  hideBundledProblem,
  listProblems,
  resetBundledProblem,
  restoreBundledProblem,
  updateBundledProblem,
} from "../api/problems";
import { resolveProblem, resolveSession, useLibrary } from "./library";

const mockedList = vi.mocked(listProblems);
const mockedUpdate = vi.mocked(updateBundledProblem);
const mockedHide = vi.mocked(hideBundledProblem);
const mockedRestore = vi.mocked(restoreBundledProblem);
const mockedReset = vi.mocked(resetBundledProblem);

// A bundled set the API "returns" — deliberately not the real PROBLEMS content,
// so a passing test proves the store's active data comes from the API, not from
// bundled runtime content.
const apiBundled: Problem[] = [
  {
    id: "two-sum",
    title: "Two Sum",
    difficulty: "easy",
    tags: ["array"],
    origin: "bundled",
    solutions: [{ id: "ts1", lang: "python", approach: "Hash map", code: "pass" }],
  },
  {
    id: "valid-parens",
    title: "Valid Parentheses",
    difficulty: "easy",
    tags: ["stack"],
    origin: "bundled",
    solutions: [{ id: "vp1", lang: "python", approach: "Stack", code: "pass" }],
  },
];

const ok = (problems: Problem[]): ProblemListResponse => ({ problems, nextCursor: null });

// The test runtime is `node`; back localStorage with an in-memory Map so the
// store's local override/custom merge layer works without a browser.
function createLocalStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => [...store.keys()][index] ?? null,
    removeItem: (key: string) => void store.delete(key),
    setItem: (key: string, value: string) => void store.set(key, value),
  } as unknown as Storage;
}

beforeEach(() => {
  mockedList.mockReset();
  mockedUpdate.mockReset();
  mockedHide.mockReset();
  mockedRestore.mockReset();
  mockedReset.mockReset();
  vi.stubGlobal("localStorage", createLocalStorage());
  useLibrary.setState({
    problems: [],
    bundled: [],
    hiddenProblems: [],
    overriddenProblemIds: [],
    authenticated: false,
    status: "idle",
    error: null,
  });
});

describe("useLibrary.load", () => {
  it("starts idle and populates problems from the API, ending ready", async () => {
    mockedList.mockResolvedValue(ok(apiBundled));
    expect(useLibrary.getState().status).toBe("idle");
    expect(useLibrary.getState().problems).toEqual([]);

    await useLibrary.getState().load();

    const state = useLibrary.getState();
    expect(state.status).toBe("ready");
    expect(state.error).toBeNull();
    // Active data is exactly the API-sourced set (no local edits) — not bundled
    // runtime content read directly.
    expect(state.problems).toEqual(apiBundled);
    expect(state.bundled).toEqual(apiBundled);
  });

  it("sets status error and a message when the API load fails", async () => {
    mockedList.mockRejectedValue(new Error("network down"));

    await expect(useLibrary.getState().load()).rejects.toThrow("network down");

    const state = useLibrary.getState();
    expect(state.status).toBe("error");
    expect(state.error).toBe("network down");
  });
});

describe("useLibrary.ensureLoaded", () => {
  it("triggers exactly one load for concurrent callers", async () => {
    mockedList.mockResolvedValue(ok(apiBundled));

    await Promise.all([useLibrary.getState().ensureLoaded(), useLibrary.getState().ensureLoaded()]);

    expect(mockedList).toHaveBeenCalledTimes(1);
    expect(useLibrary.getState().status).toBe("ready");
  });

  it("retries after a failed load", async () => {
    mockedList.mockRejectedValueOnce(new Error("net")).mockResolvedValue(ok(apiBundled));

    await useLibrary.getState().ensureLoaded();
    expect(useLibrary.getState().status).toBe("error");

    await useLibrary.getState().ensureLoaded();
    expect(useLibrary.getState().status).toBe("ready");
    expect(mockedList).toHaveBeenCalledTimes(2);
  });
});

describe("route-loader helpers", () => {
  it("resolveProblem awaits hydration instead of transiently missing", async () => {
    // Defer the API response so we can observe that resolution waits for it.
    let resolveResponse: (value: ProblemListResponse) => void = () => {};
    mockedList.mockReturnValue(
      new Promise<ProblemListResponse>((resolve) => {
        resolveResponse = resolve;
      }),
    );

    const pending = resolveProblem("two-sum");
    // Mid-load the store is empty, but the helper must not resolve to null yet.
    expect(useLibrary.getState().problems).toEqual([]);

    resolveResponse(ok(apiBundled));
    expect(await pending).toEqual(apiBundled[0]);
  });

  it("resolveProblem returns null only for a genuinely unknown id", async () => {
    mockedList.mockResolvedValue(ok(apiBundled));
    expect(await resolveProblem("ghost")).toBeNull();
  });

  it("resolveSession resolves a Problem and Solution, or null when either is missing", async () => {
    mockedList.mockResolvedValue(ok(apiBundled));

    expect(await resolveSession("two-sum", "ts1")).toEqual({
      problem: apiBundled[0],
      solution: apiBundled[0]!.solutions[0],
    });
    expect(await resolveSession("two-sum", "ghost")).toBeNull();
    expect(await resolveSession("ghost", "ts1")).toBeNull();
  });
});

describe("local writes after API hydration", () => {
  it("appends a saved custom Problem to the effective Library", async () => {
    mockedList.mockResolvedValue(ok(apiBundled));
    await useLibrary.getState().load();

    const custom: Problem = {
      id: "custom-1",
      title: "My Problem",
      difficulty: "medium",
      tags: ["custom"],
      origin: "custom",
      solutions: [{ id: "c1", lang: "python", approach: "Mine", code: "pass" }],
    };
    await useLibrary.getState().saveProblem(custom);

    const ids = useLibrary.getState().problems.map((p) => p.id);
    expect(ids).toEqual(["two-sum", "valid-parens", "custom-1"]);
  });
});

describe("authenticated effective Library", () => {
  const edited = { ...apiBundled[0]!, title: "Two Sum — server override" };

  it("uses the server-effective merge and exposes Override/Tombstone metadata", async () => {
    // A stale anonymous local Override must not shadow authenticated server state.
    localStorage.setItem(
      "ct:problems:overrides",
      JSON.stringify({ "two-sum": { ...apiBundled[0], title: "stale local edit" } }),
    );
    mockedList.mockResolvedValue({
      problems: [edited],
      nextCursor: null,
      personalization: {
        overriddenProblemIds: ["two-sum", "valid-parens"],
        hiddenProblems: [{ ...apiBundled[1]!, title: "Hidden personal snapshot" }],
      },
    });

    await useLibrary.getState().load();

    expect(useLibrary.getState()).toMatchObject({
      authenticated: true,
      problems: [edited],
      overriddenProblemIds: ["two-sum", "valid-parens"],
      hiddenProblems: [{ ...apiBundled[1]!, title: "Hidden personal snapshot" }],
    });
  });

  it("persists edit, Hide, Restore, and Reset through the API then refreshes", async () => {
    mockedList.mockResolvedValue({
      problems: apiBundled,
      nextCursor: null,
      personalization: { overriddenProblemIds: ["two-sum"], hiddenProblems: [] },
    });
    mockedUpdate.mockResolvedValue({ problem: edited });
    mockedHide.mockResolvedValue({ ok: true });
    mockedRestore.mockResolvedValue({ ok: true });
    mockedReset.mockResolvedValue({ ok: true });
    await useLibrary.getState().load();

    await useLibrary.getState().saveProblem(edited);
    await useLibrary.getState().deleteProblem("two-sum");
    await useLibrary.getState().restoreProblem("two-sum");
    await useLibrary.getState().resetProblem("two-sum");

    expect(mockedUpdate).toHaveBeenCalledWith("two-sum", edited);
    expect(mockedHide).toHaveBeenCalledWith("two-sum");
    expect(mockedRestore).toHaveBeenCalledWith("two-sum");
    expect(mockedReset).toHaveBeenCalledWith("two-sum");
    expect(mockedList).toHaveBeenCalledTimes(5);
  });
});
