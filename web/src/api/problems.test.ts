import { afterEach, describe, expect, it, vi } from "vitest";
import type { Problem } from "@shared/types";
import { ApiError } from "./client";
import {
  archiveProblem,
  createProblem,
  getProblem,
  listProblems,
  permanentlyDeleteProblem,
  restoreProblem,
  updateProblem,
} from "./problems";

const twoSum: Problem = {
  id: "two-sum",
  title: "Two Sum",
  difficulty: "easy",
  tags: ["array", "hash-map"],
  origin: "bundled",
  solutions: [],
};

function stubFetch(impl: (url: string) => Response | Promise<Response>) {
  const fn = vi.fn((input: RequestInfo | URL, _init?: RequestInit) =>
    Promise.resolve(impl(String(input))),
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

describe("custom Problem mutations", () => {
  const custom: Problem = { ...twoSum, id: "custom/id", origin: "custom" };

  it("creates and updates complete custom Problems as JSON", async () => {
    const fetchSpy = stubFetch(() => jsonResponse(custom));

    await createProblem(custom);
    await updateProblem(custom);

    expect(fetchSpy.mock.calls[0]?.[0]).toBe("/api/problems");
    expect(fetchSpy.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify(custom),
    });
    expect(fetchSpy.mock.calls[1]?.[0]).toBe("/api/problems/custom%2Fid");
    expect(fetchSpy.mock.calls[1]?.[1]).toMatchObject({ method: "PATCH" });
  });

  it("uses distinct archive, restore, and permanent-delete endpoints", async () => {
    const fetchSpy = stubFetch((url) =>
      url.endsWith("/permanent") ? new Response(null, { status: 204 }) : jsonResponse(custom),
    );

    await archiveProblem(custom.id);
    await restoreProblem(custom.id);
    await permanentlyDeleteProblem(custom.id);

    expect(fetchSpy.mock.calls.map((call) => [call[0], call[1]?.method])).toEqual([
      ["/api/problems/custom%2Fid", "DELETE"],
      ["/api/problems/custom%2Fid/restore", "POST"],
      ["/api/problems/custom%2Fid/permanent", "DELETE"],
    ]);
  });
});
