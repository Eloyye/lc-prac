import { Hono } from "hono";
import type { Problem, Solution, Example } from "../../shared/types";
import type { RequestLoggerVariables } from "../middleware/request-logger";
import { requireUser } from "../middleware/session";
import type { AuthVariables } from "../middleware/session";
import type { Db } from "../db/client";
import {
  getProblem,
  hideBundledProblem,
  listProblems,
  MAX_LIMIT,
  resetBundledProblem,
  restoreBundledProblem,
  saveProblemOverride,
} from "../services/problems";
import type { ListProblemsQuery } from "../services/problems";

const DIFFICULTIES = new Set(["easy", "medium", "hard"]);
const ORIGINS = new Set(["bundled", "custom"]);
const STATUSES = new Set(["active", "archived"]);

type ParsedQuery =
  | { ok: true; value: ListProblemsQuery }
  | { ok: false; fieldErrors: Record<string, string[]> };

type ParsedProblem =
  | { ok: true; value: Problem }
  | { ok: false; fieldErrors: Record<string, string[]> };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(
  source: Record<string, unknown>,
  key: string,
  target: Record<string, unknown>,
  fieldErrors: Record<string, string[]>,
): void {
  const value = source[key];
  if (value === undefined) return;
  if (typeof value !== "string") {
    fieldErrors[key] = ["Must be a string."];
    return;
  }
  target[key] = value;
}

function parseSolution(
  value: unknown,
  index: number,
  fieldErrors: Record<string, string[]>,
): Solution | null {
  const key = `solutions.${index}`;
  if (!isRecord(value)) {
    fieldErrors[key] = ["Must be an object."];
    return null;
  }
  if (typeof value.id !== "string" || value.id.trim() === "") {
    fieldErrors[`${key}.id`] = ["Must be a non-empty string."];
  }
  if (value.lang !== "python") fieldErrors[`${key}.lang`] = ["Must be python."];
  if (typeof value.approach !== "string" || value.approach.trim() === "") {
    fieldErrors[`${key}.approach`] = ["Must be a non-empty string."];
  }
  if (typeof value.code !== "string" || value.code.trim() === "") {
    fieldErrors[`${key}.code`] = ["Must be a non-empty string."];
  }
  const result: Record<string, unknown> = {};
  optionalString(value, "timeComplexity", result, fieldErrors);
  optionalString(value, "spaceComplexity", result, fieldErrors);
  if (Object.keys(fieldErrors).some((field) => field === key || field.startsWith(`${key}.`))) {
    return null;
  }
  return {
    id: value.id as string,
    lang: "python",
    approach: value.approach as string,
    code: value.code as string,
    ...(result as Pick<Solution, "timeComplexity" | "spaceComplexity">),
  };
}

function parseExample(
  value: unknown,
  index: number,
  fieldErrors: Record<string, string[]>,
): Example | null {
  const key = `examples.${index}`;
  if (!isRecord(value)) {
    fieldErrors[key] = ["Must be an object."];
    return null;
  }
  if (typeof value.input !== "string") fieldErrors[`${key}.input`] = ["Must be a string."];
  if (typeof value.output !== "string") fieldErrors[`${key}.output`] = ["Must be a string."];
  if (value.explanation !== undefined && typeof value.explanation !== "string") {
    fieldErrors[`${key}.explanation`] = ["Must be a string."];
  }
  if (Object.keys(fieldErrors).some((field) => field === key || field.startsWith(`${key}.`))) {
    return null;
  }
  return {
    input: value.input as string,
    output: value.output as string,
    ...(value.explanation === undefined ? {} : { explanation: value.explanation as string }),
  };
}

/** Validate and normalize a complete bundled-Problem Override snapshot. */
function parseProblemSnapshot(value: unknown, routeId: string): ParsedProblem {
  if (!isRecord(value)) return { ok: false, fieldErrors: { body: ["Must be an object."] } };

  const fieldErrors: Record<string, string[]> = {};
  if (value.id !== routeId) fieldErrors.id = ["Must match the route Problem id."];
  if (value.origin !== "bundled") fieldErrors.origin = ["Must remain bundled."];
  if (typeof value.title !== "string" || value.title.trim() === "") {
    fieldErrors.title = ["Must be a non-empty string."];
  }
  if (value.difficulty !== "easy" && value.difficulty !== "medium" && value.difficulty !== "hard") {
    fieldErrors.difficulty = ["Must be one of easy, medium, hard."];
  }
  if (!Array.isArray(value.tags) || value.tags.some((tag) => typeof tag !== "string")) {
    fieldErrors.tags = ["Must be an array of strings."];
  }
  if (!Array.isArray(value.solutions) || value.solutions.length === 0) {
    fieldErrors.solutions = ["Must contain at least one Solution."];
  }

  const optional: Record<string, unknown> = {};
  for (const key of ["url", "statement", "expectedTime", "expectedSpace"]) {
    optionalString(value, key, optional, fieldErrors);
  }

  const parsedSolutions = Array.isArray(value.solutions)
    ? value.solutions.map((solution, index) => parseSolution(solution, index, fieldErrors))
    : [];
  const solutionIds = parsedSolutions.flatMap((solution) =>
    solution === null ? [] : [solution.id],
  );
  if (new Set(solutionIds).size !== solutionIds.length) {
    fieldErrors.solutions = ["Solution ids must be unique."];
  }

  let parsedExamples: Example[] | undefined;
  if (value.examples !== undefined) {
    if (!Array.isArray(value.examples)) {
      fieldErrors.examples = ["Must be an array."];
    } else {
      parsedExamples = value.examples
        .map((example, index) => parseExample(example, index, fieldErrors))
        .filter((example): example is Example => example !== null);
    }
  }

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
  return {
    ok: true,
    value: {
      id: routeId,
      title: value.title as string,
      difficulty: value.difficulty as Problem["difficulty"],
      tags: value.tags as string[],
      origin: "bundled",
      ...(optional as Pick<Problem, "url" | "statement" | "expectedTime" | "expectedSpace">),
      ...(parsedExamples === undefined ? {} : { examples: parsedExamples }),
      solutions: parsedSolutions as Solution[],
    },
  };
}

/** A present, non-empty query value; treats `?q=` (empty) as absent. */
function present(value: string | undefined): string | undefined {
  return value !== undefined && value !== "" ? value : undefined;
}

/**
 * Validate the list query string into a typed `ListProblemsQuery`. Unknown enum
 * values and out-of-range limits are rejected (400) rather than silently
 * ignored, so a malformed Library link fails loudly instead of returning a
 * misleading list.
 */
function parseListQuery(raw: Record<string, string>): ParsedQuery {
  const fieldErrors: Record<string, string[]> = {};
  const value: ListProblemsQuery = {};

  const q = present(raw.q);
  if (q !== undefined) value.q = q;
  const tag = present(raw.tag);
  if (tag !== undefined) value.tag = tag;
  const cursor = present(raw.cursor);
  if (cursor !== undefined) value.cursor = cursor;

  const difficulty = present(raw.difficulty);
  if (difficulty !== undefined) {
    if (DIFFICULTIES.has(difficulty)) {
      value.difficulty = difficulty as ListProblemsQuery["difficulty"];
    } else {
      fieldErrors.difficulty = ["Must be one of easy, medium, hard."];
    }
  }

  const origin = present(raw.origin);
  if (origin !== undefined) {
    if (ORIGINS.has(origin)) {
      value.origin = origin as ListProblemsQuery["origin"];
    } else {
      fieldErrors.origin = ["Must be one of bundled, custom."];
    }
  }

  const status = present(raw.status);
  if (status !== undefined) {
    if (STATUSES.has(status)) {
      value.status = status as ListProblemsQuery["status"];
    } else {
      fieldErrors.status = ["Must be one of active, archived."];
    }
  }

  const limit = present(raw.limit);
  if (limit !== undefined) {
    const parsed = Number(limit);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_LIMIT) {
      fieldErrors.limit = [`Must be an integer between 1 and ${MAX_LIMIT}.`];
    } else {
      value.limit = parsed;
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }
  return { ok: true, value };
}

/**
 * The Problem Library API, mounted at `/api/problems`:
 *
 * - `GET /`     the effective Library list with filters and cursor pagination.
 * - `GET /:id`  one effective Problem, or a JSON 404 for an unknown id.
 *
 * Anonymous reads return pristine bundled Problems. Authenticated reads apply
 * the caller's private Overrides and Tombstones; mutations require a session.
 */
export function createProblemsRouter(db: Db) {
  const router = new Hono<{ Variables: RequestLoggerVariables & AuthVariables }>();

  router.get("/", (c) => {
    const parsed = parseListQuery(c.req.query());
    if (!parsed.ok) {
      return c.json(
        {
          error: {
            code: "VALIDATION",
            message: "Invalid query parameters.",
            requestId: c.get("requestId"),
            fieldErrors: parsed.fieldErrors,
          },
        },
        400,
      );
    }
    return c.json(listProblems(db, parsed.value, c.var.user?.id));
  });

  router.patch("/:id", requireUser, async (c) => {
    const parsed = parseProblemSnapshot(await c.req.json().catch(() => null), c.req.param("id"));
    if (!parsed.ok) {
      return c.json(
        {
          error: {
            code: "VALIDATION",
            message: "Invalid Problem snapshot.",
            requestId: c.get("requestId"),
            fieldErrors: parsed.fieldErrors,
          },
        },
        400,
      );
    }
    if (!saveProblemOverride(db, c.var.user!.id, parsed.value)) {
      return c.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "Problem not found.",
            requestId: c.get("requestId"),
          },
        },
        404,
      );
    }
    return c.json({ problem: parsed.value });
  });

  router.delete("/:id", requireUser, (c) => {
    if (!hideBundledProblem(db, c.var.user!.id, c.req.param("id"))) {
      return c.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "Problem not found.",
            requestId: c.get("requestId"),
          },
        },
        404,
      );
    }
    return c.json({ ok: true });
  });

  router.post("/:id/restore", requireUser, (c) => {
    if (!restoreBundledProblem(db, c.var.user!.id, c.req.param("id"))) {
      return c.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "Problem not found.",
            requestId: c.get("requestId"),
          },
        },
        404,
      );
    }
    return c.json({ ok: true });
  });

  router.post("/:id/reset", requireUser, (c) => {
    if (!resetBundledProblem(db, c.var.user!.id, c.req.param("id"))) {
      return c.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "Problem not found.",
            requestId: c.get("requestId"),
          },
        },
        404,
      );
    }
    return c.json({ ok: true });
  });

  router.get("/:id", (c) => {
    const problem = getProblem(db, c.req.param("id"), c.var.user?.id);
    if (problem === null) {
      return c.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "Problem not found.",
            requestId: c.get("requestId"),
          },
        },
        404,
      );
    }
    return c.json(problem);
  });

  return router;
}
