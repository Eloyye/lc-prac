import { and, eq } from "drizzle-orm";
import { pino } from "pino";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PROBLEMS } from "../../shared/content/problems";
import type {
  LocalDataImportResponse,
  LocalDataImportStatusResponse,
  Problem,
} from "../../shared/types";
import { createApp } from "../app";
import { createAuth } from "../auth";
import { openDatabase } from "../db/client";
import type { DbConnection } from "../db/client";
import {
  attempts,
  bestScores,
  localDataImports,
  problemOverrides,
  problemTombstones,
  problems,
  userSettings,
} from "../db/schema";
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

function customProblem(id: string, title = `Problem ${id}`): Problem {
  return {
    id,
    title,
    difficulty: "easy",
    tags: ["array"],
    origin: "custom",
    solutions: [
      {
        id: `${id}-solution`,
        lang: "python",
        approach: "Local approach",
        code: "def solve():\n    return 1",
      },
    ],
  };
}

function localAttempt(id: string, problemId: string, solutionId: string, cpm: number) {
  return {
    id,
    problemId,
    solutionId,
    cpm,
    wpm: cpm / 5,
    accuracyPct: 80,
    durationMs: 60_000,
    createdAt: `2026-07-17T12:${cpm === 100 ? "00" : "01"}:00.000Z`,
  };
}

function currentAttempt(id: string) {
  return {
    id,
    problemId: "two-sum",
    solutionId: "two-sum-hashmap",
    mode: "copy",
    cpm: 50,
    wpm: 10,
    accuracyPct: 100,
    durationMs: 2_000,
    totalKeystrokes: 20,
    errorKeystrokes: 0,
    correctChars: 20,
    createdAt: "2026-07-17T10:00:00.000Z",
  };
}

describe("/api/local-data-import", () => {
  it("imports every supported collection, keeps server conflicts, and recomputes PBs", async () => {
    const cookie = await signUp("Importer", "local-import@example.com");
    const serverWinner = customProblem("server-winner", "Server title");
    expect((await request("/api/problems", cookie, "POST", serverWinner)).status).toBe(201);

    const twoSum = PROBLEMS.find((problem) => problem.id === "two-sum")!;
    expect(
      (
        await request("/api/problems/two-sum", cookie, "PATCH", {
          ...twoSum,
          title: "Server Override",
        })
      ).status,
    ).toBe(200);
    expect((await request("/api/problems/contains-duplicate", cookie, "DELETE")).status).toBe(200);
    expect(
      (await request("/api/attempts", cookie, "POST", currentAttempt("server-attempt"))).status,
    ).toBe(201);

    const importedCustom = customProblem("local-custom", "Imported custom");
    const validParentheses = PROBLEMS.find((problem) => problem.id === "valid-parentheses")!;
    const response = await request("/api/local-data-import", cookie, "POST", {
      action: "import",
      idempotencyToken: "browser-token-1",
      customProblems: [importedCustom, customProblem("server-winner", "Local loses")],
      overrides: [
        { ...validParentheses, title: "Imported Override" },
        { ...twoSum, title: "Local Override loses" },
      ],
      tombstones: ["binary-search", "contains-duplicate"],
      attempts: [
        localAttempt("local-slower", importedCustom.id, importedCustom.solutions[0]!.id, 100),
        localAttempt("local-best", importedCustom.id, importedCustom.solutions[0]!.id, 200),
        localAttempt("server-attempt", importedCustom.id, importedCustom.solutions[0]!.id, 999),
        { ...localAttempt("missing-solution", importedCustom.id, "missing", 300) },
        { ...localAttempt("invalid-attempt", importedCustom.id, "missing", 300), cpm: -1 },
      ],
      settings: {
        mode: "recall",
        distractionFree: true,
        theme: "legacy-dark",
        smoothCaret: true,
      },
      // Legacy local PBs are not a supported input and must never be trusted.
      bestScores: [{ problemId: importedCustom.id, bestCpm: 9999 }],
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as LocalDataImportResponse;
    expect(body.replayed).toBe(false);
    expect(body.report.imported).toEqual({
      customProblems: 1,
      overrides: 1,
      tombstones: 1,
      attempts: 2,
      settings: 1,
    });
    expect(body.report.skipped).toEqual(
      expect.arrayContaining([
        { collection: "customProblems", id: "server-winner", reason: "conflict" },
        { collection: "overrides", id: "two-sum", reason: "conflict" },
        { collection: "tombstones", id: "contains-duplicate", reason: "conflict" },
        { collection: "attempts", id: "server-attempt", reason: "conflict" },
        { collection: "attempts", id: "missing-solution", reason: "unavailable" },
        { collection: "attempts", id: "invalid-attempt", reason: "invalid" },
      ]),
    );

    expect(
      conn.db.select().from(problems).where(eq(problems.id, "server-winner")).get(),
    ).toMatchObject({ title: "Server title" });
    expect(
      conn.db
        .select()
        .from(problemOverrides)
        .where(
          and(
            eq(problemOverrides.bundledProblemId, "valid-parentheses"),
            eq(problemOverrides.userId, conn.db.select().from(localDataImports).get()!.userId),
          ),
        )
        .get(),
    ).toMatchObject({ snapshotJson: expect.stringContaining("Imported Override") });
    expect(
      conn.db
        .select()
        .from(problemTombstones)
        .where(eq(problemTombstones.bundledProblemId, "binary-search"))
        .get(),
    ).toBeDefined();
    expect(conn.db.select().from(attempts).all()).toHaveLength(3);
    expect(
      conn.db.select().from(attempts).where(eq(attempts.id, "local-slower")).get(),
    ).toMatchObject({
      mode: "copy",
      correctChars: 100,
      totalKeystrokes: 125,
      errorKeystrokes: 25,
    });
    expect(
      conn.db.select().from(bestScores).where(eq(bestScores.problemId, importedCustom.id)).get(),
    ).toMatchObject({ attemptId: "local-best", bestCpm: 200 });
    expect(conn.db.select().from(userSettings).get()).toMatchObject({
      mode: "recall",
      distractionFree: true,
    });
    const settingsColumns = conn.sqlite
      .prepare("PRAGMA table_info('user_settings')")
      .all()
      .map((column) => (column as { name: string }).name);
    expect(settingsColumns).toEqual(["user_id", "mode", "distraction_free", "updated_at_ms"]);

    // Authenticated reads immediately expose the transaction's server state.
    const library = (await (await request("/api/problems", cookie)).json()) as {
      problems: Problem[];
    };
    expect(library.problems.find((problem) => problem.id === importedCustom.id)?.title).toBe(
      "Imported custom",
    );
    expect(library.problems.find((problem) => problem.id === "valid-parentheses")?.title).toBe(
      "Imported Override",
    );
    expect(library.problems.some((problem) => problem.id === "binary-search")).toBe(false);
    expect(await (await request("/api/settings", cookie)).json()).toMatchObject({
      settings: { mode: "recall", distractionFree: true },
    });
    expect(
      await (await request(`/api/stats/best-scores?problemId=${importedCustom.id}`, cookie)).json(),
    ).toMatchObject({ bestScores: [{ attemptId: "local-best", bestCpm: 200 }] });

    const replay = await request("/api/local-data-import", cookie, "POST", {
      action: "import",
      idempotencyToken: "browser-token-1",
      customProblems: [],
      overrides: [],
      tombstones: [],
      attempts: [],
    });
    expect(replay.status).toBe(200);
    expect((await replay.json()) as LocalDataImportResponse).toEqual({
      report: body.report,
      replayed: true,
    });
    expect(conn.db.select().from(attempts).all()).toHaveLength(3);
    expect(conn.db.select().from(localDataImports).all()).toHaveLength(1);

    expect(
      (
        await request("/api/local-data-import", cookie, "POST", {
          action: "skip",
          idempotencyToken: "different-token",
        })
      ).status,
    ).toBe(409);
  });

  it("records nothing on a failed request and accepts a corrected retry with the same token", async () => {
    const cookie = await signUp("Retry", "local-import-retry@example.com");
    const failed = await request("/api/local-data-import", cookie, "POST", {
      action: "import",
      idempotencyToken: "retry-token",
      customProblems: "not-an-array",
      overrides: [],
      tombstones: [],
      attempts: [],
    });
    expect(failed.status).toBe(400);
    expect(conn.db.select().from(localDataImports).all()).toEqual([]);
    // A pre-existing account Settings row is authoritative on the corrected
    // submission, just like record-id conflicts in the other collections.
    expect((await request("/api/settings", cookie)).status).toBe(200);

    const correctedPayload = {
      action: "import",
      idempotencyToken: "retry-token",
      customProblems: [customProblem("retry-custom")],
      overrides: [],
      tombstones: [],
      attempts: [],
      settings: { mode: "recall", distractionFree: true },
    };
    conn.sqlite.exec(`
      CREATE TRIGGER force_import_report_failure
      BEFORE INSERT ON local_data_imports
      BEGIN
        SELECT RAISE(ABORT, 'forced import report failure');
      END;
    `);
    const transactionFailure = await request(
      "/api/local-data-import",
      cookie,
      "POST",
      correctedPayload,
    );
    expect(transactionFailure.status).toBe(500);
    expect(conn.db.select().from(localDataImports).all()).toEqual([]);
    expect(
      conn.db.select().from(problems).where(eq(problems.id, "retry-custom")).get(),
    ).toBeUndefined();

    conn.sqlite.exec("DROP TRIGGER force_import_report_failure");
    const corrected = await request("/api/local-data-import", cookie, "POST", correctedPayload);
    expect(corrected.status).toBe(201);
    expect((await corrected.json()) as LocalDataImportResponse).toMatchObject({
      report: {
        decision: "imported",
        imported: { customProblems: 1, settings: 0 },
        skipped: [{ collection: "settings", id: "current", reason: "conflict" }],
      },
      replayed: false,
    });
    expect(conn.db.select().from(localDataImports).all()).toHaveLength(1);
    expect(conn.db.select().from(userSettings).get()).toMatchObject({
      mode: "copy",
      distractionFree: false,
    });
  });

  it("supports an explicit idempotent skip and reports completion on later reads", async () => {
    expect((await app.request("/api/local-data-import")).status).toBe(401);
    const cookie = await signUp("Skip", "local-import-skip@example.com");
    expect((await request("/api/local-data-import", cookie)).status).toBe(200);
    expect(
      (await (
        await request("/api/local-data-import", cookie)
      ).json()) as LocalDataImportStatusResponse,
    ).toEqual({
      status: "pending",
    });

    const skipped = await request("/api/local-data-import", cookie, "POST", {
      action: "skip",
      idempotencyToken: "skip-token",
    });
    expect(skipped.status).toBe(201);
    const result = (await skipped.json()) as LocalDataImportResponse;
    expect(result).toMatchObject({ report: { decision: "skipped" }, replayed: false });

    const status = (await (
      await request("/api/local-data-import", cookie)
    ).json()) as LocalDataImportStatusResponse;
    expect(status).toEqual({ status: "complete", report: result.report });

    const replay = await request("/api/local-data-import", cookie, "POST", {
      action: "skip",
      idempotencyToken: "skip-token",
    });
    expect(replay.status).toBe(200);
    expect((await replay.json()) as LocalDataImportResponse).toEqual({
      report: result.report,
      replayed: true,
    });
  });
});
