import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { pino } from "pino";
import { PROBLEMS } from "../../shared/content/problems";
import type { Problem } from "../../shared/types";
import { createApp } from "../app";
import { createAuth } from "../auth";
import { openDatabase } from "../db/client";
import type { DbConnection } from "../db/client";
import { runMigrations } from "../db/migrate";
import { seedBundledProblems } from "../db/seed";

const logger = pino({ level: "silent" });
const ORIGIN = "http://localhost:3000";
const SECRET = "test-secret-that-is-at-least-32-characters";
const PASSWORD = "correct-horse-battery-staple";

type ProblemListBody = {
  problems: Problem[];
  nextCursor: string | null;
  personalization?: {
    overriddenProblemIds: string[];
    hiddenProblems: Problem[];
  } | null;
};
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
  const auth = createAuth({
    db: conn.db,
    baseURL: ORIGIN,
    secret: SECRET,
    secureCookies: false,
  });
  app = createApp({ logger, auth, db: conn.db });
});

afterEach(() => {
  conn.close();
});

const ids = (body: ProblemListBody): string[] => body.problems.map((p) => p.id);

function cookieFrom(response: Response): string {
  const setCookie = response.headers.get("set-cookie");
  if (setCookie === null) throw new Error("Expected a session cookie");
  return setCookie.split(";", 1)[0];
}

async function signUp(name: string, email: string): Promise<string> {
  const response = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({ name, email, password: PASSWORD }),
  });
  expect(response.status).toBe(200);
  return cookieFrom(response);
}

async function requestWithCookie(
  path: string,
  cookie: string,
  method = "GET",
  body?: unknown,
): Promise<Response> {
  return await app.request(path, {
    method,
    headers: {
      cookie,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const customProblem: Problem = {
  id: "custom-ada",
  title: "Count Letters",
  difficulty: "medium",
  tags: ["String", "hash-map"],
  origin: "custom",
  statement: "Count every **letter**.",
  expectedTime: "O(n)",
  expectedSpace: "O(k)",
  examples: [{ input: '"aba"', output: '{"a": 2, "b": 1}', explanation: "Count each." }],
  solutions: [
    {
      id: "custom-ada-solution",
      lang: "python",
      approach: "Frequency map",
      code: "def count_letters(value):\n    return Counter(value)",
      timeComplexity: "O(n)",
      spaceComplexity: "O(k)",
    },
  ],
};

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

describe("authenticated custom Problem lifecycle", () => {
  it("requires authentication for every mutation", async () => {
    expect((await app.request("/api/problems", { method: "POST", body: "{}" })).status).toBe(401);
    expect(
      (await app.request("/api/problems/missing", { method: "PATCH", body: "{}" })).status,
    ).toBe(401);
    expect((await app.request("/api/problems/missing", { method: "DELETE" })).status).toBe(401);
    expect((await app.request("/api/problems/missing/restore", { method: "POST" })).status).toBe(
      401,
    );
    expect(
      (await app.request("/api/problems/missing/permanent", { method: "DELETE" })).status,
    ).toBe(401);
  });

  it("creates and edits every custom Problem content surface", async () => {
    const cookie = await signUp("Ada", "ada-problems@example.com");
    const created = await requestWithCookie("/api/problems", cookie, "POST", customProblem);

    expect(created.status).toBe(201);
    const normalized = { ...customProblem, tags: ["string", "hash-map"] };
    expect(await created.json()).toEqual(normalized);

    const edited: Problem = {
      ...normalized,
      title: "Count Unicode Letters",
      statement: "Count every Unicode code point.",
      examples: [{ input: '"åå"', output: '{"å": 2}' }],
      solutions: [
        ...normalized.solutions,
        {
          id: "custom-ada-solution-2",
          lang: "python",
          approach: "Manual map",
          code: "def count_letters(value):\n    counts = {}\n    return counts",
        },
      ],
    };
    const updated = await requestWithCookie(
      `/api/problems/${customProblem.id}`,
      cookie,
      "PATCH",
      edited,
    );

    expect(updated.status).toBe(200);
    expect(await updated.json()).toEqual(edited);
    expect(
      await (await requestWithCookie(`/api/problems/${customProblem.id}`, cookie)).json(),
    ).toEqual(edited);
  });

  it("isolates active and archived custom Problems between two users", async () => {
    const ada = await signUp("Ada", "ada-isolation@example.com");
    const grace = await signUp("Grace", "grace-isolation@example.com");
    expect((await requestWithCookie("/api/problems", ada, "POST", customProblem)).status).toBe(201);

    const adaActive = (await (
      await requestWithCookie("/api/problems", ada)
    ).json()) as ProblemListBody;
    const graceActive = (await (
      await requestWithCookie("/api/problems", grace)
    ).json()) as ProblemListBody;
    const anonymousActive = (await (await app.request("/api/problems")).json()) as ProblemListBody;
    expect(ids(adaActive)).toContain(customProblem.id);
    expect(ids(graceActive)).not.toContain(customProblem.id);
    expect(ids(anonymousActive)).not.toContain(customProblem.id);
    expect((await requestWithCookie(`/api/problems/${customProblem.id}`, grace)).status).toBe(404);
    expect(
      (await requestWithCookie(`/api/problems/${customProblem.id}`, grace, "DELETE")).status,
    ).toBe(404);

    expect(
      (await requestWithCookie(`/api/problems/${customProblem.id}`, ada, "DELETE")).status,
    ).toBe(200);
    const adaArchived = (await (
      await requestWithCookie("/api/problems?status=archived", ada)
    ).json()) as ProblemListBody;
    const graceArchived = (await (
      await requestWithCookie("/api/problems?status=archived", grace)
    ).json()) as ProblemListBody;
    expect(adaArchived.problems).toEqual([{ ...customProblem, tags: ["string", "hash-map"] }]);
    expect(graceArchived.problems).toEqual([]);
    expect((await requestWithCookie(`/api/problems/${customProblem.id}`, ada)).status).toBe(404);
  });

  it("restores identity and permits permanent deletion only while archived", async () => {
    const cookie = await signUp("Ada", "ada-lifecycle@example.com");
    await requestWithCookie("/api/problems", cookie, "POST", customProblem);

    expect(
      (await requestWithCookie(`/api/problems/${customProblem.id}/permanent`, cookie, "DELETE"))
        .status,
    ).toBe(404);
    await requestWithCookie(`/api/problems/${customProblem.id}`, cookie, "DELETE");
    const restored = await requestWithCookie(
      `/api/problems/${customProblem.id}/restore`,
      cookie,
      "POST",
    );
    expect(restored.status).toBe(200);
    expect(await restored.json()).toEqual({ ...customProblem, tags: ["string", "hash-map"] });

    await requestWithCookie(`/api/problems/${customProblem.id}`, cookie, "DELETE");
    const removed = await requestWithCookie(
      `/api/problems/${customProblem.id}/permanent`,
      cookie,
      "DELETE",
    );
    expect(removed.status).toBe(204);
    const archived = (await (
      await requestWithCookie("/api/problems?status=archived", cookie)
    ).json()) as ProblemListBody;
    expect(archived.problems).toEqual([]);
  });
});

describe("bundled Problem personalization", () => {
  const original = PROBLEMS.find((problem) => problem.id === "two-sum")!;
  const edited: Problem = {
    ...original,
    title: "Two Sum — personalized",
    statement: "My private notes",
    expectedTime: "O(n)",
    expectedSpace: "O(n)",
    examples: [{ input: "nums = [2, 7], target = 9", output: "[0, 1]" }],
    tags: [...original.tags, "favorite"],
    solutions: original.solutions.map((solution) => ({
      ...solution,
      approach: `${solution.approach} (mine)`,
    })),
  };

  it("isolates Overrides and Tombstones between two users and the global bundle", async () => {
    const ada = await signUp("Ada", "ada-bundled@example.com");
    const grace = await signUp("Grace", "grace-bundled@example.com");

    const update = await requestWithCookie("/api/problems/two-sum", ada, "PATCH", edited);
    expect(update.status).toBe(200);
    expect(await update.json()).toEqual(edited);
    expect(await (await requestWithCookie("/api/problems/two-sum", ada)).json()).toEqual(edited);
    expect(await (await requestWithCookie("/api/problems/two-sum", grace)).json()).toEqual(
      original,
    );

    expect((await requestWithCookie("/api/problems/two-sum", grace, "DELETE")).status).toBe(200);
    expect((await requestWithCookie("/api/problems/two-sum", grace)).status).toBe(404);
    expect((await requestWithCookie("/api/problems/two-sum", ada)).status).toBe(200);
    expect(await (await app.request("/api/problems/two-sum")).json()).toEqual(original);
  });

  it("retains an Override while hidden and restores that same snapshot", async () => {
    const cookie = await signUp("Restore", "restore-bundled@example.com");
    await requestWithCookie("/api/problems/two-sum", cookie, "PATCH", edited);
    await requestWithCookie("/api/problems/two-sum", cookie, "DELETE");

    const hiddenList = (await (
      await requestWithCookie("/api/problems", cookie)
    ).json()) as ProblemListBody;
    expect(ids(hiddenList)).not.toContain("two-sum");
    expect(hiddenList.personalization).toEqual({
      overriddenProblemIds: ["two-sum"],
      hiddenProblems: [edited],
    });

    expect((await requestWithCookie("/api/problems/two-sum/restore", cookie, "POST")).status).toBe(
      200,
    );
    expect(await (await requestWithCookie("/api/problems/two-sum", cookie)).json()).toEqual(edited);
  });

  it("resets only the Override while leaving the Tombstone in place", async () => {
    const cookie = await signUp("Reset", "reset-bundled@example.com");
    await requestWithCookie("/api/problems/two-sum", cookie, "PATCH", edited);
    await requestWithCookie("/api/problems/two-sum", cookie, "DELETE");

    expect((await requestWithCookie("/api/problems/two-sum/reset", cookie, "POST")).status).toBe(
      200,
    );
    const stillHidden = (await (
      await requestWithCookie("/api/problems", cookie)
    ).json()) as ProblemListBody;
    expect(ids(stillHidden)).not.toContain("two-sum");
    expect(stillHidden.personalization).toEqual({
      overriddenProblemIds: [],
      hiddenProblems: [original],
    });

    await requestWithCookie("/api/problems/two-sum/restore", cookie, "POST");
    expect(await (await requestWithCookie("/api/problems/two-sum", cookie)).json()).toEqual(
      original,
    );
  });

  it("rejects anonymous writes and preserves bundled provenance", async () => {
    expect((await app.request("/api/problems/two-sum", { method: "DELETE" })).status).toBe(401);
    const cookie = await signUp("Validation", "validation-bundled@example.com");
    const response = await requestWithCookie("/api/problems/two-sum", cookie, "PATCH", {
      ...edited,
      id: "different-id",
      origin: "custom",
      solutions: [],
    });
    expect(response.status).toBe(400);
    expect((await response.json()) as unknown).toMatchObject({
      error: {
        code: "VALIDATION",
        fieldErrors: {
          id: expect.any(Array),
          origin: expect.any(Array),
          solutions: expect.any(Array),
        },
      },
    });
  });
});
