import { Hono } from "hono";
import type { Context } from "hono";
import type { Problem } from "../../shared/types";
import type { Db } from "../db/client";
import type { RequestLoggerVariables } from "../middleware/request-logger";
import { requireUser } from "../middleware/session";
import type { AuthVariables } from "../middleware/session";
import {
  archiveCustomProblem,
  createCustomProblem,
  getProblem,
  hideBundledProblem,
  listProblems,
  MAX_LIMIT,
  permanentlyDeleteCustomProblem,
  resetBundledProblem,
  restoreBundledProblem,
  restoreCustomProblem,
  saveProblemOverride,
  updateCustomProblem,
} from "../services/problems";
import type { CustomProblemMutationResult, ListProblemsQuery } from "../services/problems";
import { isNonEmptyString, isRecord } from "./validation";
import type { FieldErrors } from "./validation";

const DIFFICULTIES = new Set(["easy", "medium", "hard"]);
const ORIGINS = new Set(["bundled", "custom"]);
const STATUSES = new Set(["active", "archived"]);

type RouterVariables = RequestLoggerVariables & AuthVariables;
type ParsedQuery = { ok: true; value: ListProblemsQuery } | { ok: false; fieldErrors: FieldErrors };
type ParsedProblem = { ok: true; value: Problem } | { ok: false; fieldErrors: FieldErrors };

function present(value: string | undefined): string | undefined {
  return value !== undefined && value !== "" ? value : undefined;
}

function parseListQuery(raw: Record<string, string>): ParsedQuery {
  const fieldErrors: FieldErrors = {};
  const value: ListProblemsQuery = {};
  const q = present(raw.q);
  if (q !== undefined) value.q = q;
  const tag = present(raw.tag);
  if (tag !== undefined) value.tag = tag;
  const cursor = present(raw.cursor);
  if (cursor !== undefined) value.cursor = cursor;

  const difficulty = present(raw.difficulty);
  if (difficulty !== undefined) {
    if (DIFFICULTIES.has(difficulty))
      value.difficulty = difficulty as ListProblemsQuery["difficulty"];
    else fieldErrors.difficulty = ["Must be one of easy, medium, hard."];
  }
  const origin = present(raw.origin);
  if (origin !== undefined) {
    if (ORIGINS.has(origin)) value.origin = origin as ListProblemsQuery["origin"];
    else fieldErrors.origin = ["Must be one of bundled, custom."];
  }
  const status = present(raw.status);
  if (status !== undefined) {
    if (STATUSES.has(status)) value.status = status as ListProblemsQuery["status"];
    else fieldErrors.status = ["Must be one of active, archived."];
  }
  const limit = present(raw.limit);
  if (limit !== undefined) {
    const parsed = Number(limit);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_LIMIT) {
      fieldErrors.limit = [`Must be an integer between 1 and ${MAX_LIMIT}.`];
    } else value.limit = parsed;
  }
  return Object.keys(fieldErrors).length > 0 ? { ok: false, fieldErrors } : { ok: true, value };
}

function optionalString(value: unknown, field: string, errors: FieldErrors): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") {
    errors[field] = ["Must be a string."];
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/** Validate and normalize the complete Problem document accepted by writes. */
function parseProblem(body: unknown, origin: Problem["origin"], routeId?: string): ParsedProblem {
  if (!isRecord(body)) return { ok: false, fieldErrors: { body: ["Must be a JSON object."] } };
  const errors: FieldErrors = {};
  if (!isNonEmptyString(body.id)) errors.id = ["A non-empty id is required."];
  else if (routeId !== undefined && body.id !== routeId) errors.id = ["Must match the route id."];
  if (!isNonEmptyString(body.title)) errors.title = ["A non-empty title is required."];
  if (typeof body.difficulty !== "string" || !DIFFICULTIES.has(body.difficulty)) {
    errors.difficulty = ["Must be one of easy, medium, hard."];
  }
  if (body.origin !== origin) errors.origin = [`Must remain ${origin}.`];

  const url = optionalString(body.url, "url", errors);
  const statement = optionalString(body.statement, "statement", errors);
  const expectedTime = optionalString(body.expectedTime, "expectedTime", errors);
  const expectedSpace = optionalString(body.expectedSpace, "expectedSpace", errors);

  const tagValues: string[] = [];
  if (!Array.isArray(body.tags)) errors.tags = ["Must be an array of strings."];
  else {
    for (const tag of body.tags) {
      if (!isNonEmptyString(tag)) {
        errors.tags = ["Every tag must be a non-empty string."];
        break;
      }
      const normalized = tag.trim().toLowerCase();
      if (!tagValues.includes(normalized)) tagValues.push(normalized);
    }
  }

  const solutionValues: Problem["solutions"] = [];
  if (!Array.isArray(body.solutions) || body.solutions.length === 0) {
    errors.solutions = ["At least one Solution is required."];
  } else {
    const ids = new Set<string>();
    body.solutions.forEach((candidate, index) => {
      const key = `solutions.${index}`;
      if (!isRecord(candidate)) {
        errors[key] = ["Must be an object."];
        return;
      }
      if (!isNonEmptyString(candidate.id)) errors[`${key}.id`] = ["A non-empty id is required."];
      else if (ids.has(candidate.id)) errors[`${key}.id`] = ["Solution ids must be unique."];
      else ids.add(candidate.id);
      if (candidate.lang !== "python") errors[`${key}.lang`] = ["Must be python."];
      if (!isNonEmptyString(candidate.approach)) {
        errors[`${key}.approach`] = ["A non-empty approach is required."];
      }
      if (!isNonEmptyString(candidate.code)) {
        errors[`${key}.code`] = ["Non-empty code is required."];
      }
      const timeComplexity = optionalString(
        candidate.timeComplexity,
        `${key}.timeComplexity`,
        errors,
      );
      const spaceComplexity = optionalString(
        candidate.spaceComplexity,
        `${key}.spaceComplexity`,
        errors,
      );
      if (
        isNonEmptyString(candidate.id) &&
        candidate.lang === "python" &&
        isNonEmptyString(candidate.approach) &&
        isNonEmptyString(candidate.code)
      ) {
        solutionValues.push({
          id: candidate.id,
          lang: "python",
          approach: candidate.approach.trim(),
          code: candidate.code.replace(/\r\n/g, "\n"),
          ...(timeComplexity === undefined ? {} : { timeComplexity }),
          ...(spaceComplexity === undefined ? {} : { spaceComplexity }),
        });
      }
    });
  }

  const exampleValues: NonNullable<Problem["examples"]> = [];
  if (body.examples !== undefined) {
    if (!Array.isArray(body.examples)) errors.examples = ["Must be an array."];
    else {
      body.examples.forEach((candidate, index) => {
        const key = `examples.${index}`;
        if (!isRecord(candidate)) {
          errors[key] = ["Must be an object."];
          return;
        }
        if (!isNonEmptyString(candidate.input)) errors[`${key}.input`] = ["Input is required."];
        if (!isNonEmptyString(candidate.output)) errors[`${key}.output`] = ["Output is required."];
        const explanation = optionalString(candidate.explanation, `${key}.explanation`, errors);
        if (isNonEmptyString(candidate.input) && isNonEmptyString(candidate.output)) {
          exampleValues.push({
            input: candidate.input.trim(),
            output: candidate.output.trim(),
            ...(explanation === undefined ? {} : { explanation }),
          });
        }
      });
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, fieldErrors: errors };
  return {
    ok: true,
    value: {
      id: (body.id as string).trim(),
      title: (body.title as string).trim(),
      difficulty: body.difficulty as Problem["difficulty"],
      tags: tagValues,
      origin,
      ...(url === undefined ? {} : { url }),
      ...(statement === undefined ? {} : { statement }),
      ...(expectedTime === undefined ? {} : { expectedTime }),
      ...(expectedSpace === undefined ? {} : { expectedSpace }),
      ...(exampleValues.length === 0 ? {} : { examples: exampleValues }),
      solutions: solutionValues,
    },
  };
}

function mutationError(
  c: Context<{ Variables: RouterVariables }>,
  result: Exclude<CustomProblemMutationResult, { kind: "ok" }>,
) {
  const requestId = c.get("requestId");
  if (result.kind === "conflict") {
    return c.json(
      {
        error: {
          code: "CONFLICT",
          message: "A Problem or Solution id is already in use.",
          requestId,
        },
      },
      409,
    );
  }
  return c.json(
    { error: { code: "NOT_FOUND", message: "Custom Problem not found.", requestId } },
    404,
  );
}

export function createProblemsRouter(db: Db) {
  const router = new Hono<{ Variables: RouterVariables }>();

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

  router.post("/", requireUser, async (c) => {
    const parsed = parseProblem(await c.req.json().catch(() => null), "custom");
    if (!parsed.ok) {
      return c.json(
        {
          error: {
            code: "VALIDATION",
            message: "Invalid custom Problem.",
            requestId: c.var.requestId,
            fieldErrors: parsed.fieldErrors,
          },
        },
        400,
      );
    }
    const result = createCustomProblem(db, c.var.user!.id, parsed.value);
    return result.kind === "ok" ? c.json(result.problem, 201) : mutationError(c, result);
  });

  router.patch("/:id", requireUser, async (c) => {
    const id = c.req.param("id");
    const existing = getProblem(db, id, c.var.user!.id);
    if (existing === null) {
      return c.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "Problem not found.",
            requestId: c.var.requestId,
          },
        },
        404,
      );
    }
    const body = await c.req.json().catch(() => null);
    const parsed = parseProblem(body, existing.origin, id);
    if (!parsed.ok) {
      return c.json(
        {
          error: {
            code: "VALIDATION",
            message: "Invalid custom Problem.",
            requestId: c.var.requestId,
            fieldErrors: parsed.fieldErrors,
          },
        },
        400,
      );
    }
    if (parsed.value.id !== id) {
      return c.json(
        {
          error: {
            code: "VALIDATION",
            message: "Problem id cannot change.",
            requestId: c.var.requestId,
            fieldErrors: { id: ["Must match the route id."] },
          },
        },
        400,
      );
    }
    if (existing.origin === "bundled") {
      if (!saveProblemOverride(db, c.var.user!.id, parsed.value)) {
        return c.json(
          {
            error: {
              code: "NOT_FOUND",
              message: "Bundled Problem not found.",
              requestId: c.var.requestId,
            },
          },
          404,
        );
      }
      return c.json(parsed.value);
    }
    const result = updateCustomProblem(db, c.var.user!.id, parsed.value.id, parsed.value);
    return result.kind === "ok" ? c.json(result.problem) : mutationError(c, result);
  });

  router.delete("/:id", requireUser, (c) => {
    const problem = getProblem(db, c.req.param("id"), c.var.user!.id);
    if (problem?.origin === "bundled") {
      return hideBundledProblem(db, c.var.user!.id, problem.id)
        ? c.json({ ok: true })
        : mutationError(c, { kind: "not-found" });
    }
    const result = archiveCustomProblem(db, c.var.user!.id, c.req.param("id"));
    return result.kind === "ok" ? c.json(result.problem) : mutationError(c, result);
  });

  router.post("/:id/restore", requireUser, (c) => {
    if (restoreBundledProblem(db, c.var.user!.id, c.req.param("id"))) {
      return c.json({ ok: true });
    }
    const result = restoreCustomProblem(db, c.var.user!.id, c.req.param("id"));
    return result.kind === "ok" ? c.json(result.problem) : mutationError(c, result);
  });

  router.post("/:id/reset", requireUser, (c) => {
    return resetBundledProblem(db, c.var.user!.id, c.req.param("id"))
      ? c.json({ ok: true })
      : mutationError(c, { kind: "not-found" });
  });

  router.delete("/:id/permanent", requireUser, (c) => {
    if (!permanentlyDeleteCustomProblem(db, c.var.user!.id, c.req.param("id"))) {
      return mutationError(c, { kind: "not-found" });
    }
    return c.body(null, 204);
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
