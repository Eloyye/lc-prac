import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Problem } from "@shared/types";
import type { ProblemListResponse } from "../api/problems";

vi.mock("../api/problems", () => ({
  listProblems: vi.fn(),
  createProblem: vi.fn(),
  updateProblem: vi.fn(),
  archiveProblem: vi.fn(),
  restoreProblem: vi.fn(),
  permanentlyDeleteProblem: vi.fn(),
}));

import {
  archiveProblem,
  createProblem,
  listProblems,
  permanentlyDeleteProblem,
  restoreProblem,
  updateProblem,
} from "../api/problems";
import { resolveProblem, resolveSession, useLibrary } from "./library";

const mockedList = vi.mocked(listProblems);
const mockedCreate = vi.mocked(createProblem);
const mockedUpdate = vi.mocked(updateProblem);
const mockedArchive = vi.mocked(archiveProblem);
const mockedRestore = vi.mocked(restoreProblem);
const mockedPermanentDelete = vi.mocked(permanentlyDeleteProblem);

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

function mockLists(active: Problem[], archived: Problem[] = []): void {
  mockedList.mockImplementation((params) =>
    Promise.resolve(ok(params?.status === "archived" ? archived : active)),
  );
}

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
  mockedCreate.mockReset();
  mockedUpdate.mockReset();
  mockedArchive.mockReset();
  mockedRestore.mockReset();
  mockedPermanentDelete.mockReset();
  vi.stubGlobal("localStorage", createLocalStorage());
  useLibrary.setState({
    problems: [],
    bundled: [],
    custom: [],
    archived: [],
    status: "idle",
    error: null,
    actionError: null,
  });
});

describe("useLibrary.load", () => {
  it("starts idle and populates problems from the API, ending ready", async () => {
    mockLists(apiBundled);
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
    mockLists(apiBundled);

    await Promise.all([useLibrary.getState().ensureLoaded(), useLibrary.getState().ensureLoaded()]);

    expect(mockedList).toHaveBeenCalledTimes(2);
    expect(useLibrary.getState().status).toBe("ready");
  });

  it("retries after a failed load", async () => {
    mockedList.mockRejectedValueOnce(new Error("net")).mockResolvedValue(ok(apiBundled));

    await useLibrary.getState().ensureLoaded();
    expect(useLibrary.getState().status).toBe("error");

    await useLibrary.getState().ensureLoaded();
    expect(useLibrary.getState().status).toBe("ready");
    expect(mockedList).toHaveBeenCalledTimes(4);
  });
});

describe("route-loader helpers", () => {
  it("resolveProblem awaits hydration instead of transiently missing", async () => {
    // Defer the API response so we can observe that resolution waits for it.
    let resolveResponse: (value: ProblemListResponse) => void = () => {};
    mockedList.mockImplementation((params) =>
      params?.status === "archived"
        ? Promise.resolve(ok([]))
        : new Promise<ProblemListResponse>((resolve) => {
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
    mockLists(apiBundled);
    expect(await resolveProblem("ghost")).toBeNull();
  });

  it("resolveSession resolves a Problem and Solution, or null when either is missing", async () => {
    mockLists(apiBundled);

    expect(await resolveSession("two-sum", "ts1")).toEqual({
      problem: apiBundled[0],
      solution: apiBundled[0]!.solutions[0],
    });
    expect(await resolveSession("two-sum", "ghost")).toBeNull();
    expect(await resolveSession("ghost", "ts1")).toBeNull();
  });
});

describe("server-backed custom Problem lifecycle", () => {
  const custom: Problem = {
    id: "custom-1",
    title: "My Problem",
    difficulty: "medium",
    tags: ["custom"],
    origin: "custom",
    solutions: [{ id: "c1", lang: "python", approach: "Mine", code: "pass" }],
  };

  it("creates a custom Problem and appends the server response", async () => {
    mockLists(apiBundled);
    await useLibrary.getState().load();

    mockedCreate.mockResolvedValue(custom);
    await useLibrary.getState().saveProblem(custom);

    const ids = useLibrary.getState().problems.map((p) => p.id);
    expect(ids).toEqual(["two-sum", "valid-parens", "custom-1"]);
    expect(mockedCreate).toHaveBeenCalledWith(custom);
  });

  it("edits an existing custom Problem in place", async () => {
    mockLists([...apiBundled, custom]);
    await useLibrary.getState().load();
    const edited = { ...custom, title: "Edited", statement: "New statement" };
    mockedUpdate.mockResolvedValue(edited);

    await useLibrary.getState().saveProblem(edited);

    expect(useLibrary.getState().custom).toEqual([edited]);
    expect(mockedUpdate).toHaveBeenCalledWith(edited);
  });

  it("moves an archived Problem out of the active Library", async () => {
    mockLists([...apiBundled, custom]);
    await useLibrary.getState().load();
    mockedArchive.mockResolvedValue(custom);

    await useLibrary.getState().deleteProblem(custom.id);

    expect(useLibrary.getState().problems.map((problem) => problem.id)).not.toContain(custom.id);
    expect(useLibrary.getState().archived).toEqual([custom]);
  });

  it("restores an archived Problem with the same ids and content", async () => {
    mockLists(apiBundled, [custom]);
    await useLibrary.getState().load();
    mockedRestore.mockResolvedValue(custom);

    await useLibrary.getState().restoreProblem(custom.id);

    expect(useLibrary.getState().custom).toEqual([custom]);
    expect(useLibrary.getState().archived).toEqual([]);
    expect(useLibrary.getState().problems.at(-1)).toEqual(custom);
  });

  it("permanently deletes only from the archived management state", async () => {
    mockLists(apiBundled, [custom]);
    await useLibrary.getState().load();
    mockedPermanentDelete.mockResolvedValue();

    await useLibrary.getState().permanentlyDeleteProblem(custom.id);

    expect(useLibrary.getState().archived).toEqual([]);
    expect(mockedPermanentDelete).toHaveBeenCalledWith(custom.id);
  });
});
