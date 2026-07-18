import { pino } from "pino";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PROBLEMS } from "../../shared/content/problems";
import type { BestScoreListResponse, StatsSummary } from "../../shared/types";
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

async function request(
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
    accuracyPct: 90,
    durationMs: 60_000,
    totalKeystrokes: 100,
    errorKeystrokes: 10,
    correctChars: 90,
    createdAt: "2026-07-17T10:00:00.000Z",
    ...overrides,
  };
}

describe("account-backed Stats reads", () => {
  it("requires authentication for summaries and Personal Bests", async () => {
    expect((await app.request("/api/stats/summary")).status).toBe(401);
    expect((await app.request("/api/stats/best-scores")).status).toBe(401);
  });

  it("isolates ownership, separates Modes, filters, and calculates aggregates", async () => {
    const owner = await signUp("Stats owner", "stats-owner@example.com");
    const other = await signUp("Stats other", "stats-other@example.com");

    await request("/api/attempts", owner, "POST", attempt("owner-copy"));
    await request(
      "/api/attempts",
      owner,
      "POST",
      attempt("owner-recall", {
        mode: "recall",
        cpm: 200,
        wpm: 40,
        accuracyPct: 100,
        durationMs: 120_000,
        errorKeystrokes: 0,
        createdAt: "2026-07-17T11:00:00.000Z",
      }),
    );
    await request(
      "/api/attempts",
      owner,
      "POST",
      attempt("owner-brute", {
        solutionId: "two-sum-brute",
        cpm: 150,
        wpm: 30,
        accuracyPct: 80,
        durationMs: 30_000,
        errorKeystrokes: 20,
        createdAt: "2026-07-17T12:00:00.000Z",
      }),
    );
    await request(
      "/api/attempts",
      other,
      "POST",
      attempt("other-fast", { cpm: 999, wpm: 199.8, createdAt: "2026-07-17T13:00:00.000Z" }),
    );

    const summary = (await (await request("/api/stats/summary", owner)).json()) as StatsSummary;
    expect(summary).toMatchObject({
      totalAttempts: 3,
      practicedProblemCount: 1,
      averageCpm: 150,
      averageAccuracyPct: 90,
      bestCpm: 200,
      totalPracticeTimeMs: 210_000,
    });
    expect(summary.recentAttempts.map((candidate) => candidate.id)).toEqual([
      "owner-brute",
      "owner-recall",
      "owner-copy",
    ]);

    const copy = (await (
      await request("/api/stats/summary?problemId=two-sum&mode=copy", owner)
    ).json()) as StatsSummary;
    expect(copy).toMatchObject({
      problemId: "two-sum",
      mode: "copy",
      totalAttempts: 2,
      averageCpm: 125,
      averageAccuracyPct: 85,
      bestCpm: 150,
      totalPracticeTimeMs: 90_000,
    });

    const scores = (await (
      await request("/api/stats/best-scores?problemId=two-sum", owner)
    ).json()) as BestScoreListResponse;
    expect(scores.bestScores).toHaveLength(3);
    expect(
      scores.bestScores
        .filter((score) => score.solutionId === "two-sum-hashmap")
        .map((score) => [score.mode, score.bestCpm]),
    ).toEqual([
      ["copy", 100],
      ["recall", 200],
    ]);

    const recallScores = (await (
      await request("/api/stats/best-scores?solutionId=two-sum-hashmap&mode=recall", owner)
    ).json()) as BestScoreListResponse;
    expect(recallScores.bestScores).toHaveLength(1);
    expect(recallScores.bestScores[0]).toMatchObject({
      attemptId: "owner-recall",
      mode: "recall",
      bestCpm: 200,
    });
  });

  it("returns a stable zero-valued empty summary and validates filters", async () => {
    const cookie = await signUp("Empty Stats", "stats-empty@example.com");
    const summary = (await (await request("/api/stats/summary", cookie)).json()) as StatsSummary;
    expect(summary).toMatchObject({
      totalAttempts: 0,
      practicedProblemCount: 0,
      averageCpm: 0,
      averageAccuracyPct: 0,
      bestCpm: 0,
      totalPracticeTimeMs: 0,
      recentAttempts: [],
    });
    expect((await request("/api/stats/summary?mode=unknown", cookie)).status).toBe(400);
    expect((await request("/api/stats/best-scores?problemId=", cookie)).status).toBe(400);
  });
});
