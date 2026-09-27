/**
 * Characterization of every HTTP input boundary (issue #47): exact acceptance,
 * normalization, rejection messages, and error envelopes. The API-contract
 * refactor moves these parsers around; this suite must pass unchanged.
 */
import { pino } from "pino";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CREATE_ATTEMPT_OPTIONAL,
  CREATE_ATTEMPT_REQUIRED,
  FULL_CREATE_ATTEMPT,
  FULL_PROBLEM_WRITE,
  MINIMAL_CREATE_ATTEMPT,
  MINIMAL_PROBLEM_WRITE,
  PROBLEM_WRITE_OPTIONAL,
  PROBLEM_WRITE_REQUIRED,
  SOLUTION_WRITE_REQUIRED,
} from "../../shared/api/contract-fixtures";
import { PROBLEMS } from "../../shared/content/problems";
import type {
  AttemptListResponse,
  CreateAttemptResponse,
  LocalDataImportResponse,
  Problem,
  SettingsResponse,
} from "../../shared/types";
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
let cookie: string;

beforeEach(async () => {
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
  cookie = await signUp("Ada", "input-contract@example.com");
});

afterEach(() => {
  conn.close();
});

async function signUp(name: string, email: string): Promise<string> {
  const response = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({ name, email, password: PASSWORD }),
  });
  expect(response.status).toBe(200);
  const setCookie = response.headers.get("set-cookie");
  if (setCookie === null) throw new Error("Expected a session cookie");
  return setCookie.split(";", 1)[0];
}

async function request(path: string, method = "GET", body?: unknown): Promise<Response> {
  return app.request(path, {
    method,
    headers: {
      cookie,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

/** Assert the shared 400 validation envelope and return its field errors. */
async function expectValidation(
  response: Response,
  message: string,
): Promise<Record<string, string[]>> {
  expect(response.status).toBe(400);
  const body = (await response.json()) as {
    error: {
      code: string;
      message: string;
      requestId: unknown;
      fieldErrors: Record<string, string[]>;
    };
  };
  expect(body.error.code).toBe("VALIDATION");
  expect(body.error.message).toBe(message);
  expect(typeof body.error.requestId).toBe("string");
  return body.error.fieldErrors;
}

function validProblem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "contract-problem",
    title: "Contract Problem",
    difficulty: "easy",
    tags: ["array"],
    origin: "custom",
    solutions: [{ id: "contract-solution", lang: "python", approach: "Loop", code: "pass" }],
    ...overrides,
  };
}

function validAttempt(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "contract-attempt",
    problemId: "two-sum",
    solutionId: "two-sum-hashmap",
    mode: "copy",
    cpm: 100,
    wpm: 20,
    accuracyPct: 95,
    durationMs: 2_000,
    totalKeystrokes: 20,
    errorKeystrokes: 1,
    correctChars: 19,
    createdAt: "2026-07-17T10:00:00.000Z",
    ...overrides,
  };
}

describe("Problem writes", () => {
  it("normalizes an accepted custom Problem and stores exactly the normalized document", async () => {
    const response = await request("/api/problems", "POST", {
      id: "  contract-problem  ",
      title: "  Contract Problem  ",
      difficulty: "medium",
      tags: ["Array", " array ", "Hash Map"],
      origin: "custom",
      url: "",
      statement: "   ",
      expectedTime: "  O(n)  ",
      expectedSpace: null,
      examples: [{ input: "  nums = [1]  ", output: "  1  ", explanation: "" }],
      solutions: [
        {
          id: "contract-solution",
          lang: "python",
          approach: "  Hash map  ",
          code: "def f():\r\n    return 1",
          timeComplexity: " O(n) ",
          spaceComplexity: null,
        },
      ],
    });

    const expected: Problem = {
      id: "contract-problem",
      title: "Contract Problem",
      difficulty: "medium",
      tags: ["array", "hash map"],
      origin: "custom",
      expectedTime: "O(n)",
      examples: [{ input: "nums = [1]", output: "1" }],
      solutions: [
        {
          id: "contract-solution",
          lang: "python",
          approach: "Hash map",
          code: "def f():\n    return 1",
          timeComplexity: "O(n)",
        },
      ],
    };
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(expected);
    expect(await (await request("/api/problems/contract-problem")).json()).toEqual(expected);
  });

  it("omits examples when an empty examples array is accepted", async () => {
    const response = await request("/api/problems", "POST", validProblem({ examples: [] }));
    expect(response.status).toBe(201);
    expect(await response.json()).not.toHaveProperty("examples");
  });

  it("rejects a non-object body", async () => {
    for (const body of [[], "problem", null]) {
      const fieldErrors = await expectValidation(
        await request("/api/problems", "POST", body),
        "Invalid custom Problem.",
      );
      expect(fieldErrors).toEqual({ body: ["Must be a JSON object."] });
    }
  });

  it("reports every top-level field error with its exact message", async () => {
    const fieldErrors = await expectValidation(
      await request("/api/problems", "POST", {
        id: " ",
        title: "",
        difficulty: "extreme",
        origin: "bundled",
        url: 5,
        statement: false,
        expectedTime: [],
        expectedSpace: {},
        tags: "array",
        solutions: [],
        examples: "none",
      }),
      "Invalid custom Problem.",
    );
    expect(fieldErrors).toEqual({
      id: ["A non-empty id is required."],
      title: ["A non-empty title is required."],
      difficulty: ["Must be one of easy, medium, hard."],
      origin: ["Must remain custom."],
      url: ["Must be a string."],
      statement: ["Must be a string."],
      expectedTime: ["Must be a string."],
      expectedSpace: ["Must be a string."],
      tags: ["Must be an array of strings."],
      solutions: ["At least one Solution is required."],
      examples: ["Must be an array."],
    });
  });

  it("reports nested tag, Solution, and example errors by path", async () => {
    const fieldErrors = await expectValidation(
      await request(
        "/api/problems",
        "POST",
        validProblem({
          tags: ["ok", " "],
          solutions: [
            "not-a-solution",
            { id: "dup", lang: "javascript", approach: " ", code: "", timeComplexity: 1 },
            { id: "dup", lang: "python", approach: "A", code: "pass", spaceComplexity: 2 },
            { lang: "python", approach: "A", code: "pass" },
          ],
          examples: [1, { input: "", output: " ", explanation: 3 }],
        }),
      ),
      "Invalid custom Problem.",
    );
    expect(fieldErrors).toEqual({
      tags: ["Every tag must be a non-empty string."],
      "solutions.0": ["Must be an object."],
      "solutions.1.lang": ["Must be python."],
      "solutions.1.approach": ["A non-empty approach is required."],
      "solutions.1.code": ["Non-empty code is required."],
      "solutions.1.timeComplexity": ["Must be a string."],
      "solutions.2.id": ["Solution ids must be unique."],
      "solutions.2.spaceComplexity": ["Must be a string."],
      "solutions.3.id": ["A non-empty id is required."],
      "examples.0": ["Must be an object."],
      "examples.1.input": ["Input is required."],
      "examples.1.output": ["Output is required."],
      "examples.1.explanation": ["Must be a string."],
    });
  });

  it("requires a bundled Override to keep its origin and route id", async () => {
    const fieldErrors = await expectValidation(
      await request(
        "/api/problems/two-sum",
        "PATCH",
        validProblem({ id: "not-two-sum", origin: "custom" }),
      ),
      "Invalid custom Problem.",
    );
    expect(fieldErrors).toEqual({
      id: ["Must match the route id."],
      origin: ["Must remain bundled."],
    });
  });

  it("normalizes an accepted bundled Override the same way as a custom write", async () => {
    const response = await request(
      "/api/problems/two-sum",
      "PATCH",
      validProblem({ id: "two-sum", origin: "bundled", title: "  My Two Sum ", tags: ["B", "b"] }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      id: "two-sum",
      title: "My Two Sum",
      difficulty: "easy",
      tags: ["b"],
      origin: "bundled",
      solutions: [{ id: "contract-solution", lang: "python", approach: "Loop", code: "pass" }],
    });
  });

  it("returns 404 for an unknown route id before validating the body", async () => {
    const response = await request("/api/problems/missing", "PATCH", "not-an-object");
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { code: "NOT_FOUND", message: "Problem not found." },
    });
  });
});

describe("Problem Library list query", () => {
  it("treats empty query parameters as absent", async () => {
    const response = await request(
      "/api/problems?q=&tag=&difficulty=&origin=&status=&limit=&cursor=",
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { problems: Problem[] };
    expect(body.problems).toHaveLength(PROBLEMS.length);
  });

  it("reports every invalid list filter with its exact message", async () => {
    const fieldErrors = await expectValidation(
      await request("/api/problems?difficulty=extreme&origin=shared&status=deleted&limit=0"),
      "Invalid query parameters.",
    );
    expect(fieldErrors).toEqual({
      difficulty: ["Must be one of easy, medium, hard."],
      origin: ["Must be one of bundled, custom."],
      status: ["Must be one of active, archived."],
      limit: ["Must be an integer between 1 and 100."],
    });
  });

  it("accepts limit bounds and rejects non-integers", async () => {
    expect((await request("/api/problems?limit=1")).status).toBe(200);
    expect((await request("/api/problems?limit=100")).status).toBe(200);
    for (const limit of ["101", "1.5", "ten"]) {
      expect(
        await expectValidation(
          await request(`/api/problems?limit=${limit}`),
          "Invalid query parameters.",
        ),
      ).toEqual({ limit: ["Must be an integer between 1 and 100."] });
    }
  });
});

describe("Attempt writes", () => {
  it("trims ids, preserves errorMap, and defaults createdAt to the server clock", async () => {
    const before = Date.now();
    const input = validAttempt({
      id: "  contract-attempt  ",
      problemId: " two-sum ",
      solutionId: " two-sum-hashmap ",
      errorMap: { "3": 1 },
    });
    delete input.createdAt;
    const response = await request("/api/attempts", "POST", input);
    const after = Date.now();

    expect(response.status).toBe(201);
    const { attempt } = (await response.json()) as CreateAttemptResponse;
    expect(attempt).toMatchObject({
      id: "contract-attempt",
      problemId: "two-sum",
      solutionId: "two-sum-hashmap",
      mode: "copy",
      errorMap: { "3": 1 },
    });
    const createdAt = Date.parse(attempt.createdAt);
    expect(createdAt).toBeGreaterThanOrEqual(before - 1);
    expect(createdAt).toBeLessThanOrEqual(after + 1);
  });

  it("keeps a supplied createdAt", async () => {
    const response = await request("/api/attempts", "POST", validAttempt());
    const { attempt } = (await response.json()) as CreateAttemptResponse;
    expect(attempt.createdAt).toBe("2026-07-17T10:00:00.000Z");
  });

  it("rejects a non-object body", async () => {
    for (const body of [[], 1, null]) {
      expect(
        await expectValidation(await request("/api/attempts", "POST", body), "Invalid Attempt."),
      ).toEqual({ body: ["Must be a JSON object."] });
    }
  });

  it("reports every field error with its exact message", async () => {
    const fieldErrors = await expectValidation(
      await request("/api/attempts", "POST", {
        id: " ",
        problemId: "",
        solutionId: 3,
        mode: "speed",
        cpm: -1,
        wpm: "20",
        accuracyPct: null,
        durationMs: 1.5,
        totalKeystrokes: -1,
        errorKeystrokes: "1",
        createdAt: "yesterday",
      }),
      "Invalid Attempt.",
    );
    expect(fieldErrors).toEqual({
      id: ["A client-generated id is required."],
      problemId: ["A Problem id is required."],
      solutionId: ["A Solution id is required."],
      mode: ["Must be one of copy, recall, free."],
      cpm: ["Must be a finite non-negative number."],
      wpm: ["Must be a finite non-negative number."],
      accuracyPct: ["Must be a finite non-negative number."],
      durationMs: ["Must be a non-negative integer."],
      totalKeystrokes: ["Must be a non-negative integer."],
      errorKeystrokes: ["Must be a non-negative integer."],
      correctChars: ["Must be a non-negative integer."],
      createdAt: ["Must be a valid ISO date string."],
    });
  });

  it("requires Mode on a new Attempt (only legacy Import defaults it)", async () => {
    const input = validAttempt();
    delete input.mode;
    expect(
      await expectValidation(await request("/api/attempts", "POST", input), "Invalid Attempt."),
    ).toEqual({ mode: ["Must be one of copy, recall, free."] });
  });

  it("enforces cross-field and size limits", async () => {
    expect(
      await expectValidation(
        await request(
          "/api/attempts",
          "POST",
          validAttempt({
            accuracyPct: 100.5,
            totalKeystrokes: 3,
            errorKeystrokes: 4,
            createdAt: 5,
            errorMap: "x".repeat(65_536),
          }),
        ),
        "Invalid Attempt.",
      ),
    ).toEqual({
      accuracyPct: ["Must be between 0 and 100."],
      errorKeystrokes: ["Cannot exceed totalKeystrokes."],
      createdAt: ["Must be a valid ISO date string."],
      errorMap: ["Must be at most 64 KiB when serialized."],
    });
  });
});

describe("history filters", () => {
  beforeEach(async () => {
    expect((await request("/api/attempts", "POST", validAttempt())).status).toBe(201);
  });

  it("trims Problem and Solution filters", async () => {
    const response = await request(
      "/api/attempts?problemId=%20two-sum%20&solutionId=%20two-sum-hashmap%20&mode=copy",
    );
    expect(response.status).toBe(200);
    expect(((await response.json()) as AttemptListResponse).attempts).toHaveLength(1);
  });

  it("reports every invalid Attempt-history filter", async () => {
    expect(
      await expectValidation(
        await request("/api/attempts?problemId=%20&solutionId=&mode=speed&limit=101"),
        "Invalid history filters.",
      ),
    ).toEqual({
      problemId: ["Must not be empty."],
      solutionId: ["Must not be empty."],
      mode: ["Must be one of copy, recall, free."],
      limit: ["Must be an integer between 1 and 100."],
    });
  });

  it("accepts limit only on Attempt history, not on Stats reads", async () => {
    expect((await request("/api/attempts?limit=100")).status).toBe(200);
    expect(
      await expectValidation(
        await request("/api/stats/summary?limit=5&mode=speed"),
        "Invalid summary filters.",
      ),
    ).toEqual({
      mode: ["Must be one of copy, recall, free."],
      limit: ["Must be an integer between 1 and 100."],
    });
    expect(
      await expectValidation(
        await request("/api/stats/best-scores?problemId=&limit=5"),
        "Invalid Personal Best filters.",
      ),
    ).toEqual({
      problemId: ["Must not be empty."],
      limit: ["Must be an integer between 1 and 100."],
    });
  });
});

describe("Settings writes", () => {
  it("accepts a complete replacement", async () => {
    const response = await request("/api/settings", "PUT", {
      mode: "recall",
      distractionFree: true,
    });
    expect(response.status).toBe(200);
    const { settings } = (await response.json()) as SettingsResponse;
    expect(settings).toMatchObject({ mode: "recall", distractionFree: true });
    expect(Object.keys(settings).sort()).toEqual(["distractionFree", "mode", "updatedAt"]);
  });

  it("rejects a non-object body", async () => {
    for (const body of [[], "copy", null]) {
      expect(
        await expectValidation(await request("/api/settings", "PUT", body), "Invalid Settings."),
      ).toEqual({ body: ["Must be a JSON object."] });
    }
  });

  it("reports every field error with its exact message", async () => {
    expect(
      await expectValidation(
        await request("/api/settings", "PUT", { mode: "speed", theme: "dark" }),
        "Invalid Settings.",
      ),
    ).toEqual({
      mode: ["Must be one of copy, recall, free."],
      distractionFree: ["Must be a boolean."],
      theme: ["Is not a synchronized Setting."],
    });
  });
});

describe("local-data Import request", () => {
  const IMPORT_MESSAGE = "Invalid local data Import.";

  function importRequest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      action: "import",
      idempotencyToken: "contract-token",
      customProblems: [],
      overrides: [],
      tombstones: [],
      attempts: [],
      ...overrides,
    };
  }

  it("rejects a non-object body", async () => {
    expect(
      await expectValidation(await request("/api/local-data-import", "POST", []), IMPORT_MESSAGE),
    ).toEqual({ body: ["Must be a JSON object."] });
  });

  it("validates action and idempotency token before collections", async () => {
    expect(
      await expectValidation(
        await request("/api/local-data-import", "POST", {
          action: "merge",
          idempotencyToken: " ",
          customProblems: "ignored until the envelope is valid",
        }),
        IMPORT_MESSAGE,
      ),
    ).toEqual({
      action: ["Must be import or skip."],
      idempotencyToken: ["A token of at most 200 characters is required."],
    });
    expect(
      await expectValidation(
        await request(
          "/api/local-data-import",
          "POST",
          importRequest({ idempotencyToken: "t".repeat(201) }),
        ),
        IMPORT_MESSAGE,
      ),
    ).toEqual({ idempotencyToken: ["A token of at most 200 characters is required."] });
  });

  it("requires every collection to be an array but leaves settings optional", async () => {
    expect(
      await expectValidation(
        await request("/api/local-data-import", "POST", {
          action: "import",
          idempotencyToken: "contract-token",
          overrides: {},
          tombstones: "two-sum",
        }),
        IMPORT_MESSAGE,
      ),
    ).toEqual({
      customProblems: ["Must be an array."],
      overrides: ["Must be an array."],
      tombstones: ["Must be an array."],
      attempts: ["Must be an array."],
    });
  });

  it("skips without validating collections", async () => {
    const response = await request("/api/local-data-import", "POST", {
      action: "skip",
      idempotencyToken: "  contract-token  ",
    });
    expect(response.status).toBe(201);
    expect(((await response.json()) as LocalDataImportResponse).report.decision).toBe("skipped");
  });

  it("normalizes valid records and reports invalid ones as skipped by id or position", async () => {
    const response = await request(
      "/api/local-data-import",
      "POST",
      importRequest({
        customProblems: [
          validProblem({ id: " imported-custom ", tags: ["Graph", "graph"] }),
          validProblem({ id: "  bad-custom ", title: "" }),
          42,
        ],
        overrides: [validProblem({ id: "two-sum", origin: "custom" }), { title: "no id" }],
        tombstones: [" valid-parentheses ", "", 7],
        attempts: [
          {
            id: "legacy-attempt",
            problemId: "two-sum",
            solutionId: "two-sum-hashmap",
            cpm: 100,
            wpm: 20,
            accuracyPct: 80,
            durationMs: 60_000,
            createdAt: "2026-07-17T12:00:00.000Z",
          },
          { id: " bad-attempt ", cpm: -1 },
          "not-an-attempt",
        ],
        settings: { mode: "recall", theme: "dark", smoothCaret: true },
      }),
    );

    expect(response.status).toBe(201);
    const { report } = (await response.json()) as LocalDataImportResponse;
    expect(report.imported).toEqual({
      customProblems: 1,
      overrides: 0,
      tombstones: 1,
      attempts: 1,
      settings: 1,
    });
    expect(report.skipped).toEqual([
      { collection: "customProblems", id: "bad-custom", reason: "invalid" },
      { collection: "customProblems", id: "#3", reason: "invalid" },
      { collection: "overrides", id: "two-sum", reason: "invalid" },
      { collection: "overrides", id: "#2", reason: "invalid" },
      { collection: "tombstones", id: "#2", reason: "invalid" },
      { collection: "tombstones", id: "#3", reason: "invalid" },
      { collection: "attempts", id: "bad-attempt", reason: "invalid" },
      { collection: "attempts", id: "#3", reason: "invalid" },
    ]);

    expect(await (await request("/api/problems/imported-custom")).json()).toMatchObject({
      id: "imported-custom",
      tags: ["graph"],
      origin: "custom",
    });
    expect((await request("/api/problems/valid-parentheses")).status).toBe(404);

    // Legacy Attempts default to Copy and derive counters from cpm, duration, and accuracy.
    const { attempts } = (await (await request("/api/attempts")).json()) as AttemptListResponse;
    expect(attempts).toEqual([
      expect.objectContaining({
        id: "legacy-attempt",
        mode: "copy",
        correctChars: 100,
        totalKeystrokes: 125,
        errorKeystrokes: 25,
      }),
    ]);

    // Partial Settings are accepted; unsynchronized legacy keys are ignored.
    const { settings } = (await (await request("/api/settings")).json()) as SettingsResponse;
    expect(settings).toMatchObject({ mode: "recall", distractionFree: false });
  });

  it("skips invalid Settings as the single current record", async () => {
    for (const [index, settings] of [
      "recall",
      { mode: "speed" },
      { distractionFree: "yes" },
    ].entries()) {
      const response = await request(
        "/api/local-data-import",
        "POST",
        importRequest({ idempotencyToken: `settings-${index}`, settings }),
      );
      expect(response.status).toBe(201);
      const { report } = (await response.json()) as LocalDataImportResponse;
      expect(report.skipped).toEqual([
        { collection: "settings", id: "current", reason: "invalid" },
      ]);
      // Only the first decision is recorded per account; reset for the next case.
      conn.sqlite.exec("DELETE FROM local_data_imports");
    }
  });
});

describe("browser request contracts agree with the server parsers", () => {
  function without(value: Record<string, unknown>, key: string): Record<string, unknown> {
    const copy = { ...value };
    delete copy[key];
    return copy;
  }

  it("accepts a minimal and a fully populated Attempt and rejects each missing required field", async () => {
    // The key maps are type-checked to match CreateAttemptRequest exactly.
    expect(Object.keys(CREATE_ATTEMPT_OPTIONAL).sort()).toEqual(["createdAt", "errorMap"]);
    expect((await request("/api/attempts", "POST", MINIMAL_CREATE_ATTEMPT)).status).toBe(201);
    expect((await request("/api/attempts", "POST", FULL_CREATE_ATTEMPT)).status).toBe(201);

    for (const key of Object.keys(CREATE_ATTEMPT_REQUIRED)) {
      const fieldErrors = await expectValidation(
        await request("/api/attempts", "POST", without(MINIMAL_CREATE_ATTEMPT, key)),
        "Invalid Attempt.",
      );
      expect(Object.keys(fieldErrors)).toEqual([key]);
    }
  });

  it("accepts a minimal and a fully populated Problem and rejects each missing required field", async () => {
    expect(Object.keys(PROBLEM_WRITE_OPTIONAL).sort()).toEqual([
      "examples",
      "expectedSpace",
      "expectedTime",
      "statement",
      "url",
    ]);
    const minimal = await request("/api/problems", "POST", MINIMAL_PROBLEM_WRITE);
    expect(minimal.status).toBe(201);
    expect(await minimal.json()).toEqual(MINIMAL_PROBLEM_WRITE);
    const full = await request("/api/problems", "POST", FULL_PROBLEM_WRITE);
    expect(full.status).toBe(201);
    expect(await full.json()).toEqual(FULL_PROBLEM_WRITE);

    for (const key of Object.keys(PROBLEM_WRITE_REQUIRED)) {
      const fieldErrors = await expectValidation(
        await request("/api/problems", "POST", without(MINIMAL_PROBLEM_WRITE, key)),
        "Invalid custom Problem.",
      );
      expect(Object.keys(fieldErrors)).toEqual([key]);
    }
    for (const key of Object.keys(SOLUTION_WRITE_REQUIRED)) {
      const fieldErrors = await expectValidation(
        await request("/api/problems", "POST", {
          ...MINIMAL_PROBLEM_WRITE,
          solutions: [without(MINIMAL_PROBLEM_WRITE.solutions[0], key)],
        }),
        "Invalid custom Problem.",
      );
      expect(Object.keys(fieldErrors)).toEqual([`solutions.0.${key}`]);
    }
  });
});
