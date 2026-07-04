import { afterEach, describe, expect, it, vi } from "vitest";
import type { Problem } from "@shared/types";
import { ApiError } from "./client";
import {
  getProblem,
  hideBundledProblem,
  listProblems,
  resetBundledProblem,
  restoreBundledProblem,
  updateBundledProblem,
} from "./problems";

const twoSum: Problem = {
  id: "two-sum",
  title: "Two Sum",
  difficulty: "easy",
  tags: ["array", "hash-map"],
  origin: "bundled",
  solutions: [],
};

function stubFetch(impl: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const fn = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(impl(String(input), init)),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("listProblems", () => {
  it("GETs /api/problems and returns the parsed body", async () => {
    const fetchSpy = stubFetch(() => jsonResponse({ problems: [twoSum], nextCursor: null }));

    const result = await listProblems();

    expect(result).toEqual({ problems: [twoSum], nextCursor: null });
    expect(fetchSpy.mock.calls[0]?.[0]).toBe("/api/problems");
  });

  it("builds a query string from filters, omitting absent and empty values", async () => {
    const fetchSpy = stubFetch(() => jsonResponse({ problems: [], nextCursor: null }));

    await listProblems({
      difficulty: "medium",
      tag: "hash-map",
      limit: 5,
      q: "",
      cursor: undefined,
    });

    expect(fetchSpy.mock.calls[0]?.[0]).toBe(
      "/api/problems?difficulty=medium&tag=hash-map&limit=5",
    );
  });

  it("propagates a server error as an ApiError carrying status and code", async () => {
    stubFetch(() => jsonResponse({ error: { code: "VALIDATION", message: "Bad query." } }, 400));

    await expect(listProblems({ difficulty: "medium" })).rejects.toMatchObject({
      name: "ApiError",
      status: 400,
      code: "VALIDATION",
      message: "Bad query.",
    });
  });
});

describe("getProblem", () => {
  it("GETs /api/problems/:id and URL-encodes the id", async () => {
    const fetchSpy = stubFetch(() => jsonResponse(twoSum));

    const result = await getProblem("a/b");

    expect(result).toEqual(twoSum);
    expect(fetchSpy.mock.calls[0]?.[0]).toBe("/api/problems/a%2Fb");
  });

  it("rejects with a 404 ApiError when the Problem is missing", async () => {
    stubFetch(() =>
      jsonResponse({ error: { code: "NOT_FOUND", message: "Problem not found." } }, 404),
    );

    await expect(getProblem("nope")).rejects.toBeInstanceOf(ApiError);
    await expect(getProblem("nope")).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
  });

  it("maps an unreachable server to a NETWORK ApiError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))),
    );

    await expect(getProblem("two-sum")).rejects.toMatchObject({ status: 0, code: "NETWORK" });
  });
});

describe("bundled personalization mutations", () => {
  it("PATCHes a complete Override snapshot as JSON", async () => {
    const fetchSpy = stubFetch(() => jsonResponse({ problem: twoSum }));

    await updateBundledProblem("two/sum", twoSum);

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/problems/two%2Fsum",
      expect.objectContaining({
        method: "PATCH",
        credentials: "same-origin",
        body: JSON.stringify(twoSum),
      }),
    );
  });

  it.each([
    ["hide", hideBundledProblem, "/api/problems/two-sum", "DELETE"],
    ["restore", restoreBundledProblem, "/api/problems/two-sum/restore", "POST"],
    ["reset", resetBundledProblem, "/api/problems/two-sum/reset", "POST"],
  ] as const)("calls the %s endpoint", async (_name, action, url, method) => {
    const fetchSpy = stubFetch(() => jsonResponse({ ok: true }));

    await action("two-sum");

    expect(fetchSpy).toHaveBeenCalledWith(url, expect.objectContaining({ method }));
  });
});
