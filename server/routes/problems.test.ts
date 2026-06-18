import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { pino } from "pino";
import { PROBLEMS } from "../../shared/content/problems";
import type { Problem } from "../../shared/types";
import { createApp } from "../app";
import { openDatabase } from "../db/client";
import type { DbConnection } from "../db/client";
import { runMigrations } from "../db/migrate";
import { seedBundledProblems } from "../db/seed";

const logger = pino({ level: "silent" });

type ProblemListBody = { problems: Problem[]; nextCursor: string | null };
type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    requestId: string;
    fieldErrors?: Record<string, string[]>;
  };
};

let conn: DbConnection;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  conn = openDatabase(":memory:");
  runMigrations(conn.db);
  seedBundledProblems(conn.db, PROBLEMS);
  app = createApp({ logger, db: conn.db });
});

afterEach(() => {
  conn.close();
});

const ids = (body: ProblemListBody): string[] => body.problems.map((p) => p.id);

describe("GET /api/problems", () => {
  it("returns the pristine bundled Library in authored order with a request id", async () => {
    const res = await app.request("/api/problems");

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(res.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
    const body = (await res.json()) as ProblemListBody;
    expect(body.problems).toEqual(PROBLEMS);
    expect(body.nextCursor).toBeNull();
  });

  it("filters by difficulty", async () => {
    const res = await app.request("/api/problems?difficulty=medium");
    const body = (await res.json()) as ProblemListBody;
    expect(ids(body)).toEqual(["maximum-subarray", "group-anagrams", "number-of-islands"]);
  });

  it("filters by tag", async () => {
    const res = await app.request("/api/problems?tag=hash-map");
    const body = (await res.json()) as ProblemListBody;
    expect(ids(body)).toEqual(["two-sum", "group-anagrams"]);
  });

  it("filters by a free-text query over title and tags", async () => {
    const res = await app.request("/api/problems?q=island");
    const body = (await res.json()) as ProblemListBody;
    expect(ids(body)).toEqual(["number-of-islands"]);
  });

  it("returns an empty list for origin=custom (anonymous Library is bundled only)", async () => {
    const res = await app.request("/api/problems?origin=custom");
    const body = (await res.json()) as ProblemListBody;
    expect(body.problems).toEqual([]);
    expect(body.nextCursor).toBeNull();
  });

  it("paginates with limit and a follow-up cursor", async () => {
    const first = (await (await app.request("/api/problems?limit=3")).json()) as ProblemListBody;
    expect(first.problems).toHaveLength(3);
    expect(first.nextCursor).toBe("binary-search");

    const second = (await (
      await app.request(`/api/problems?limit=3&cursor=${first.nextCursor}`)
    ).json()) as ProblemListBody;
    expect(ids(second)).toEqual(["reverse-linked-list", "maximum-subarray", "climbing-stairs"]);
  });

  it("rejects an invalid difficulty with a 400 and field errors", async () => {
    const res = await app.request("/api/problems?difficulty=epic");

    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiErrorBody;
    expect(body.error.code).toBe("VALIDATION");
    expect(body.error.fieldErrors?.difficulty).toBeDefined();
    expect(body.error.requestId).toBe(res.headers.get("x-request-id"));
  });

  it("rejects an out-of-range limit with a 400", async () => {
    const res = await app.request("/api/problems?limit=0");
    expect(res.status).toBe(400);
    expect(((await res.json()) as ApiErrorBody).error.fieldErrors?.limit).toBeDefined();
  });
});

describe("GET /api/problems/:id", () => {
  it("returns a link-out bundled Problem round-tripped exactly", async () => {
    const res = await app.request("/api/problems/two-sum");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(PROBLEMS.find((p) => p.id === "two-sum"));
  });

  it("returns a self-authored Problem with statement, examples, and expected complexity", async () => {
    const res = await app.request("/api/problems/array-sum");
    const problem = (await res.json()) as Problem;

    expect(problem).toEqual(PROBLEMS.find((p) => p.id === "array-sum"));
    expect(problem.statement).toBeDefined();
    expect(problem.examples).toHaveLength(3);
    expect(problem.expectedTime).toBe("O(n)");
  });

  it("returns a JSON 404 with the request id for an unknown id", async () => {
    const res = await app.request("/api/problems/does-not-exist");

    expect(res.status).toBe(404);
    const body = (await res.json()) as ApiErrorBody;
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error.requestId).toBe(res.headers.get("x-request-id"));
  });
});
