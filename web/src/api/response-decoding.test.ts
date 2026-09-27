import { afterEach, describe, expect, it, vi } from "vitest";
import { DecodeError } from "@shared/api/decode";
import { createAttempt, listAttempts } from "./attempts";
import { ApiError } from "./client";
import {
  getLocalDataImportStatus,
  importLocalData,
  skipLocalDataImport,
} from "./local-data-import";
import {
  archiveProblem,
  createProblem,
  getProblem,
  hideBundledProblem,
  listProblems,
  permanentlyDeleteProblem,
  resetBundledProblem,
  restoreBundledProblem,
  restoreProblem,
  updateBundledProblem,
  updateProblem,
} from "./problems";
import { getSettings, replaceSettings } from "./settings";
import { getStatsSummary, listBestScores } from "./stats";

const problem = {
  id: "two-sum",
  title: "Two Sum",
  difficulty: "easy" as const,
  tags: [],
  origin: "bundled" as const,
  solutions: [{ id: "s", lang: "python" as const, approach: "A", code: "pass" }],
};

const attempt = {
  id: "a",
  problemId: "two-sum",
  solutionId: "s",
  mode: "copy" as const,
  cpm: 1,
  wpm: 1,
  accuracyPct: 100,
  durationMs: 1,
  totalKeystrokes: 1,
  errorKeystrokes: 0,
  correctChars: 1,
};

function stubBody(body: string | null, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(new Response(body, { status }))),
  );
}

async function expectInvalidResponse(call: () => Promise<unknown>, path: string, status = 200) {
  const error = await call().then(
    () => {
      throw new Error("Expected the helper to reject");
    },
    (cause: unknown) => cause,
  );
  expect(error).toBeInstanceOf(ApiError);
  expect(error).toMatchObject({
    status,
    code: "INVALID_RESPONSE",
    message: "The server sent an unexpected response.",
  });
  const cause = (error as ApiError).cause;
  expect(cause).toBeInstanceOf(DecodeError);
  expect((cause as DecodeError).path).toBe(path);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("malformed success responses", () => {
  it.each([
    [
      "listProblems without personalization",
      () => listProblems(),
      { problems: [problem], nextCursor: null },
      "personalization",
    ],
    [
      "listProblems with a malformed nested Solution",
      () => listProblems(),
      {
        problems: [{ ...problem, solutions: [{ ...problem.solutions[0], code: 1 }] }],
        nextCursor: null,
        personalization: null,
      },
      "problems[0].solutions[0].code",
    ],
    [
      "getProblem with an unknown difficulty",
      () => getProblem("two-sum"),
      { ...problem, difficulty: "extreme" },
      "difficulty",
    ],
    ["createProblem as an array", () => createProblem(problem), [], ""],
    [
      "updateProblem with a null optional field",
      () => updateProblem(problem),
      { ...problem, url: null },
      "url",
    ],
    [
      "updateBundledProblem with an unknown Origin",
      () => updateBundledProblem(problem),
      { ...problem, origin: "shared" },
      "origin",
    ],
    [
      "archiveProblem without tags",
      () => archiveProblem("x"),
      { ...problem, tags: undefined },
      "tags",
    ],
    ["restoreProblem as a string", () => restoreProblem("x"), "ok", ""],
    ["hideBundledProblem with ok false", () => hideBundledProblem("x"), { ok: false }, "ok"],
    ["restoreBundledProblem as empty", () => restoreBundledProblem("x"), {}, "ok"],
    ["resetBundledProblem as null", () => resetBundledProblem("x"), null, ""],
    [
      "createAttempt without problemTitle",
      () => createAttempt(attempt),
      {
        attempt,
        bestScore: {
          problemId: "two-sum",
          solutionId: "s",
          mode: "copy",
          bestCpm: 1,
          bestAccuracyPct: 100,
          bestDurationMs: 1,
          attemptId: "a",
          updatedAt: "2026-07-17T10:00:00.000Z",
        },
        isPersonalBest: true,
      },
      "attempt.problemTitle",
    ],
    [
      "listAttempts with an unknown Mode",
      () => listAttempts(),
      {
        attempts: [
          { ...attempt, problemTitle: "T", solutionApproach: "A", createdAt: "x", mode: "speed" },
        ],
      },
      "attempts[0].mode",
    ],
    ["listBestScores without a list", () => listBestScores(), {}, "bestScores"],
    [
      "getStatsSummary with a string count",
      () => getStatsSummary(),
      {
        totalAttempts: "2",
        practicedProblemCount: 1,
        averageCpm: 1,
        averageAccuracyPct: 1,
        bestCpm: 1,
        totalPracticeTimeMs: 1,
        recentAttempts: [],
      },
      "totalAttempts",
    ],
    [
      "getSettings with a non-boolean flag",
      () => getSettings(),
      { settings: { mode: "copy", distractionFree: "yes", updatedAt: "x" } },
      "settings.distractionFree",
    ],
    [
      "replaceSettings without settings",
      () => replaceSettings({ mode: "copy", distractionFree: false }),
      { mode: "copy", distractionFree: false },
      "settings",
    ],
    [
      "getLocalDataImportStatus complete without a report",
      () => getLocalDataImportStatus(),
      { status: "complete" },
      "report",
    ],
    [
      "importLocalData with an unknown skipped collection",
      () =>
        importLocalData({
          action: "import",
          idempotencyToken: "t",
          customProblems: [],
          overrides: [],
          tombstones: [],
          attempts: [],
        }),
      {
        report: {
          decision: "imported",
          imported: { customProblems: 0, overrides: 0, tombstones: 0, attempts: 0, settings: 0 },
          skipped: [{ collection: "themes", id: "x", reason: "invalid" }],
          completedAt: "x",
        },
        replayed: false,
      },
      "report.skipped[0].collection",
    ],
    [
      "skipLocalDataImport without replayed",
      () => skipLocalDataImport({ action: "skip", idempotencyToken: "t" }),
      {
        report: {
          decision: "skipped",
          imported: { customProblems: 0, overrides: 0, tombstones: 0, attempts: 0, settings: 0 },
          skipped: [],
          completedAt: "x",
        },
      },
      "replayed",
    ],
  ])("rejects %s", async (_name, call, body, path) => {
    stubBody(JSON.stringify(body));
    await expectInvalidResponse(call, path);
  });

  it("rejects a 2xx body that is not JSON", async () => {
    stubBody("<html>proxy error</html>");
    await expect(listProblems()).rejects.toMatchObject({
      name: "ApiError",
      status: 200,
      code: "INVALID_RESPONSE",
    });
  });

  it("rejects an empty 204 where a JSON body is required", async () => {
    stubBody(null, 204);
    await expectInvalidResponse(() => getProblem("two-sum"), "", 204);
  });

  it("rejects a JSON body where the contract is an empty 204", async () => {
    stubBody(JSON.stringify({ ok: true }), 200);
    await expectInvalidResponse(() => permanentlyDeleteProblem("x"), "");
  });

  it("keeps a decoded body identical to the server's JSON, including unknown keys", async () => {
    const body = { ...problem, futureField: { nested: true } };
    stubBody(JSON.stringify(body));
    await expect(getProblem("two-sum")).resolves.toEqual(body);
  });
});
