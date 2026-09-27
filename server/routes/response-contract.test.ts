/**
 * Every successful API response, produced by the real routes, must satisfy the
 * shared decoder the browser applies to it (issue #47). A server change that
 * drifts from `shared/api/*` fails here instead of in the browser.
 */
import { pino } from "pino";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decodeAttemptListResponse, decodeCreateAttemptResponse } from "../../shared/api/attempts";
import { FULL_CREATE_ATTEMPT, FULL_PROBLEM_WRITE } from "../../shared/api/contract-fixtures";
import { noContent } from "../../shared/api/decode";
import type { Decoder } from "../../shared/api/decode";
import {
  decodeLocalDataImportResponse,
  decodeLocalDataImportStatusResponse,
} from "../../shared/api/local-data-import";
import {
  decodeProblem,
  decodeProblemAckResponse,
  decodeProblemListResponse,
} from "../../shared/api/problems";
import { decodeSettingsResponse } from "../../shared/api/settings";
import { decodeBestScoreListResponse, decodeStatsSummary } from "../../shared/api/stats";
import { PROBLEMS } from "../../shared/content/problems";
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
  const signUp = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({
      name: "Ada",
      email: "response-contract@example.com",
      password: PASSWORD,
    }),
  });
  expect(signUp.status).toBe(200);
  cookie = signUp.headers.get("set-cookie")!.split(";", 1)[0];
});

afterEach(() => {
  conn.close();
});

/** Call the API and return the decoded 2xx body, failing on any mismatch. */
async function call<T>(
  decode: Decoder<T>,
  path: string,
  init: { method?: string; body?: unknown; anonymous?: boolean } = {},
): Promise<T> {
  const response = await app.request(path, {
    method: init.method ?? "GET",
    headers: {
      ...(init.anonymous ? {} : { cookie }),
      ...(init.body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
  expect(response.ok, `${init.method ?? "GET"} ${path} → ${response.status}`).toBe(true);
  return decode(response.status === 204 ? undefined : await response.json());
}

describe("server responses satisfy the shared browser decoders", () => {
  it("covers the Problem Library, including every optional content surface", async () => {
    const anonymous = await call(decodeProblemListResponse, "/api/problems", { anonymous: true });
    expect(anonymous.personalization).toBeNull();
    await call(decodeProblem, "/api/problems/two-sum", { anonymous: true });

    const created = await call(decodeProblem, "/api/problems", {
      method: "POST",
      body: FULL_PROBLEM_WRITE,
    });
    expect(created).toEqual(FULL_PROBLEM_WRITE);
    await call(decodeProblem, "/api/problems/two-sum", {
      method: "PATCH",
      body: { ...FULL_PROBLEM_WRITE, id: "two-sum", origin: "bundled" },
    });
    await call(decodeProblemAckResponse, "/api/problems/two-sum", { method: "DELETE" });

    const personalized = await call(decodeProblemListResponse, "/api/problems?limit=1");
    expect(personalized.personalization?.hiddenProblems).toHaveLength(1);
    expect(personalized.nextCursor).not.toBeNull();

    await call(decodeProblemAckResponse, "/api/problems/two-sum/restore", { method: "POST" });
    await call(decodeProblemAckResponse, "/api/problems/two-sum/reset", { method: "POST" });

    const id = FULL_PROBLEM_WRITE.id;
    await call(decodeProblem, `/api/problems/${id}`, { method: "DELETE" });
    await call(decodeProblem, `/api/problems/${id}/restore`, { method: "POST" });
    await call(decodeProblem, `/api/problems/${id}`, { method: "DELETE" });
    const archived = await call(
      decodeProblemListResponse,
      "/api/problems?status=archived&origin=custom",
    );
    expect(archived.problems).toHaveLength(1);
    await call(noContent, `/api/problems/${id}/permanent`, { method: "DELETE" });
  });

  it("covers Attempts and Stats, empty and populated", async () => {
    await call(decodeStatsSummary, "/api/stats/summary");
    await call(decodeBestScoreListResponse, "/api/stats/best-scores");

    await call(decodeCreateAttemptResponse, "/api/attempts", {
      method: "POST",
      body: FULL_CREATE_ATTEMPT,
    });
    const { attempts } = await call(decodeAttemptListResponse, "/api/attempts?mode=copy&limit=5");
    expect(attempts[0]?.errorMap).toEqual(FULL_CREATE_ATTEMPT.errorMap);

    const summary = await call(
      decodeStatsSummary,
      "/api/stats/summary?problemId=two-sum&solutionId=two-sum-hashmap&mode=copy",
    );
    expect(summary).toMatchObject({ problemId: "two-sum", mode: "copy", totalAttempts: 1 });
    const { bestScores } = await call(decodeBestScoreListResponse, "/api/stats/best-scores");
    expect(bestScores).toHaveLength(1);
  });

  it("covers Settings reads and replacements", async () => {
    await call(decodeSettingsResponse, "/api/settings");
    await call(decodeSettingsResponse, "/api/settings", {
      method: "PUT",
      body: { mode: "recall", distractionFree: true },
    });
  });

  it("covers local-data Import status, decisions, and replays", async () => {
    expect(await call(decodeLocalDataImportStatusResponse, "/api/local-data-import")).toEqual({
      status: "pending",
    });
    const body = {
      action: "import",
      idempotencyToken: "response-contract",
      customProblems: [{ ...FULL_PROBLEM_WRITE, id: "imported" }, 42],
      overrides: [],
      tombstones: ["two-sum"],
      attempts: [],
      settings: { mode: "free" },
    };
    const first = await call(decodeLocalDataImportResponse, "/api/local-data-import", {
      method: "POST",
      body,
    });
    expect(first.report.skipped).not.toHaveLength(0);
    const replay = await call(decodeLocalDataImportResponse, "/api/local-data-import", {
      method: "POST",
      body,
    });
    expect(replay.replayed).toBe(true);
    const status = await call(decodeLocalDataImportStatusResponse, "/api/local-data-import");
    expect(status.status).toBe("complete");
  });
});
