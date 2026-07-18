import { and, eq } from "drizzle-orm";
import { pino } from "pino";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PROBLEMS } from "../../shared/content/problems";
import type { AttemptListResponse, CreateAttemptResponse, Problem } from "../../shared/types";
import { createApp } from "../app";
import { createAuth } from "../auth";
import { openDatabase } from "../db/client";
import type { DbConnection } from "../db/client";
import { attempts, bestScores } from "../db/schema";
import { runMigrations } from "../db/migrate";
import { seedBundledProblems } from "../db/seed";

const logger = pino({ level: "silent" });
const ORIGIN = "http://localhost:3000";
const SECRET = "test-secret-that-is-at-least-32-characters";
const PASSWORD = "correct-horse-battery-staple";

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
  return app.request(path, {
    method,
    headers: {
      cookie,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function attempt(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    problemId: "two-sum",
    solutionId: "two-sum-hashmap",
    mode: "copy",
    cpm: 100,
    wpm: 20,
    accuracyPct: 95,
    durationMs: 2_000,
    totalKeystrokes: 100,
    errorKeystrokes: 5,
    correctChars: 90,
    errorMap: { "x@12": 2 },
    createdAt: "2026-07-17T12:00:00.000Z",
    ...overrides,
  };
}

const customProblem: Problem = {
  id: "custom-attempt-problem",
  title: "Owned Problem",
  difficulty: "medium",
  tags: ["array"],
  origin: "custom",
  solutions: [
    {
      id: "custom-attempt-solution",
      lang: "python",
      approach: "Owned approach",
      code: "def solve():\n    return 1",
    },
  ],
};

describe("POST /api/attempts", () => {
  it("requires authentication and rejects unreadable Problems or Solutions", async () => {
    expect(
      (
        await app.request("/api/attempts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(attempt("anonymous")),
        })
      ).status,
    ).toBe(401);

    const owner = await signUp("Owner", "attempt-owner@example.com");
    const other = await signUp("Other", "attempt-other@example.com");
    expect((await requestWithCookie("/api/problems", owner, "POST", customProblem)).status).toBe(
      201,
    );

    const privateAttempt = attempt("private", {
      problemId: customProblem.id,
      solutionId: customProblem.solutions[0]!.id,
    });
    expect((await requestWithCookie("/api/attempts", other, "POST", privateAttempt)).status).toBe(
      404,
    );
    expect(
      (
        await requestWithCookie(
          "/api/attempts",
          owner,
          "POST",
          attempt("wrong-solution", { solutionId: "not-effective" }),
        )
      ).status,
    ).toBe(404);
    expect(conn.db.select().from(attempts).all()).toEqual([]);
  });

  it("stores immutable snapshots from the caller's effective bundled Override", async () => {
    const cookie = await signUp("Ada", "attempt-override@example.com");
    const original = PROBLEMS.find((problem) => problem.id === "two-sum")!;
    const overridden: Problem = {
      ...original,
      title: "My Two Sum",
      solutions: [
        {
          ...original.solutions[0]!,
          id: "my-private-solution",
          approach: "My private approach",
        },
      ],
    };
    expect(
      (await requestWithCookie("/api/problems/two-sum", cookie, "PATCH", overridden)).status,
    ).toBe(200);

    const response = await requestWithCookie(
      "/api/attempts",
      cookie,
      "POST",
      attempt("snapshot", { solutionId: "my-private-solution" }),
    );
    expect(response.status).toBe(201);
    const body = (await response.json()) as CreateAttemptResponse;
    expect(body.attempt).toMatchObject({
      id: "snapshot",
      problemTitle: "My Two Sum",
      solutionApproach: "My private approach",
      totalKeystrokes: 100,
      errorKeystrokes: 5,
      correctChars: 90,
      errorMap: { "x@12": 2 },
      createdAt: "2026-07-17T12:00:00.000Z",
    });

    await requestWithCookie("/api/problems/two-sum/reset", cookie, "POST");
    expect(conn.db.select().from(attempts).where(eq(attempts.id, "snapshot")).get()).toMatchObject({
      problemTitle: "My Two Sum",
      solutionApproach: "My private approach",
    });
    const history = await requestWithCookie("/api/attempts?problemId=two-sum", cookie);
    expect(((await history.json()) as AttemptListResponse).attempts[0]).toMatchObject({
      problemTitle: "My Two Sum",
      solutionApproach: "My private approach",
    });
  });

  it("is idempotent by id and updates Mode-specific PBs using documented tie-breakers", async () => {
    const cookie = await signUp("PB", "attempt-pb@example.com");

    const first = await requestWithCookie("/api/attempts", cookie, "POST", attempt("first"));
    expect(first.status).toBe(201);
    expect((await first.json()) as CreateAttemptResponse).toMatchObject({
      isPersonalBest: true,
      bestScore: { attemptId: "first", bestCpm: 100, bestAccuracyPct: 95 },
    });

    const replay = await requestWithCookie("/api/attempts", cookie, "POST", attempt("first"));
    expect(replay.status).toBe(200);
    expect(conn.db.select().from(attempts).all()).toHaveLength(1);

    const slower = await requestWithCookie(
      "/api/attempts",
      cookie,
      "POST",
      attempt("slower", { cpm: 90, wpm: 18 }),
    );
    expect((await slower.json()) as CreateAttemptResponse).toMatchObject({
      isPersonalBest: false,
      bestScore: { attemptId: "first" },
    });

    await requestWithCookie(
      "/api/attempts",
      cookie,
      "POST",
      attempt("accurate", { accuracyPct: 98, errorKeystrokes: 2 }),
    );
    const shorter = await requestWithCookie(
      "/api/attempts",
      cookie,
      "POST",
      attempt("shorter", { accuracyPct: 98, errorKeystrokes: 2, durationMs: 1_500 }),
    );
    expect((await shorter.json()) as CreateAttemptResponse).toMatchObject({
      isPersonalBest: true,
      bestScore: { attemptId: "shorter", bestCpm: 100, bestAccuracyPct: 98 },
    });

    await requestWithCookie(
      "/api/attempts",
      cookie,
      "POST",
      attempt("recall", { mode: "recall", cpm: 50, wpm: 10 }),
    );
    expect(conn.db.select().from(attempts).all()).toHaveLength(5);
    expect(conn.db.select().from(bestScores).all()).toHaveLength(2);
    expect(
      conn.db.select().from(bestScores).where(eq(bestScores.mode, "copy")).get(),
    ).toMatchObject({ attemptId: "shorter" });
    expect(
      conn.db.select().from(bestScores).where(eq(bestScores.mode, "recall")).get(),
    ).toMatchObject({ attemptId: "recall" });
  });

  it("preserves history on hide/archive and purges it on permanent custom deletion", async () => {
    const cookie = await signUp("Lifecycle", "attempt-lifecycle@example.com");
    await requestWithCookie("/api/problems", cookie, "POST", customProblem);
    await requestWithCookie("/api/attempts", cookie, "POST", attempt("bundled-history"));
    await requestWithCookie(
      "/api/attempts",
      cookie,
      "POST",
      attempt("custom-history", {
        problemId: customProblem.id,
        solutionId: customProblem.solutions[0]!.id,
      }),
    );

    await requestWithCookie("/api/problems/two-sum", cookie, "DELETE");
    await requestWithCookie(`/api/problems/${customProblem.id}`, cookie, "DELETE");
    expect(conn.db.select().from(attempts).all()).toHaveLength(2);
    expect(conn.db.select().from(bestScores).all()).toHaveLength(2);

    expect(
      (await requestWithCookie(`/api/problems/${customProblem.id}/permanent`, cookie, "DELETE"))
        .status,
    ).toBe(204);
    expect(conn.db.select().from(attempts).all()).toHaveLength(1);
    expect(conn.db.select().from(bestScores).all()).toHaveLength(1);
    expect(
      conn.db
        .select()
        .from(attempts)
        .where(and(eq(attempts.problemId, "two-sum"), eq(attempts.id, "bundled-history")))
        .get(),
    ).toBeDefined();
  });
});

describe("GET /api/attempts", () => {
  it("isolates ownership and filters by Problem, Solution, and Mode", async () => {
    expect((await app.request("/api/attempts")).status).toBe(401);
    const owner = await signUp("History owner", "history-owner@example.com");
    const other = await signUp("History other", "history-other@example.com");

    await requestWithCookie(
      "/api/attempts",
      owner,
      "POST",
      attempt("copy-hash", { createdAt: "2026-07-17T10:00:00.000Z" }),
    );
    await requestWithCookie(
      "/api/attempts",
      owner,
      "POST",
      attempt("recall-hash", {
        mode: "recall",
        cpm: 80,
        createdAt: "2026-07-17T11:00:00.000Z",
      }),
    );
    await requestWithCookie(
      "/api/attempts",
      owner,
      "POST",
      attempt("copy-brute", {
        solutionId: "two-sum-brute",
        createdAt: "2026-07-17T12:00:00.000Z",
      }),
    );
    await requestWithCookie(
      "/api/attempts",
      other,
      "POST",
      attempt("other-private", { cpm: 999, createdAt: "2026-07-17T13:00:00.000Z" }),
    );

    const all = (await (
      await requestWithCookie("/api/attempts?problemId=two-sum", owner)
    ).json()) as AttemptListResponse;
    expect(all.attempts.map((candidate) => candidate.id)).toEqual([
      "copy-brute",
      "recall-hash",
      "copy-hash",
    ]);
    expect(all.attempts.some((candidate) => candidate.id === "other-private")).toBe(false);

    const recall = (await (
      await requestWithCookie("/api/attempts?problemId=two-sum&mode=recall", owner)
    ).json()) as AttemptListResponse;
    expect(recall.attempts.map((candidate) => candidate.id)).toEqual(["recall-hash"]);

    const brute = (await (
      await requestWithCookie("/api/attempts?solutionId=two-sum-brute&mode=copy&limit=1", owner)
    ).json()) as AttemptListResponse;
    expect(brute.attempts.map((candidate) => candidate.id)).toEqual(["copy-brute"]);
  });

  it("rejects invalid Mode and limit filters", async () => {
    const cookie = await signUp("Invalid filters", "history-invalid@example.com");
    expect((await requestWithCookie("/api/attempts?mode=speed", cookie)).status).toBe(400);
    expect((await requestWithCookie("/api/attempts?limit=0", cookie)).status).toBe(400);
    expect((await requestWithCookie("/api/attempts?limit=101", cookie)).status).toBe(400);
  });
});
