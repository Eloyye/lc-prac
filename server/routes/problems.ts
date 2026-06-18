import { Hono } from "hono";
import type { RequestLoggerVariables } from "../middleware/request-logger";
import type { Db } from "../db/client";
import { getProblem, listProblems, MAX_LIMIT } from "../services/problems";
import type { ListProblemsQuery } from "../services/problems";

const DIFFICULTIES = new Set(["easy", "medium", "hard"]);
const ORIGINS = new Set(["bundled", "custom"]);
const STATUSES = new Set(["active", "archived"]);

type ParsedQuery =
  | { ok: true; value: ListProblemsQuery }
  | { ok: false; fieldErrors: Record<string, string[]> };

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
 * The anonymous Problem Library API, mounted at `/api/problems`:
 *
 * - `GET /`     the effective Library list with filters and cursor pagination.
 * - `GET /:id`  one effective Problem, or a JSON 404 for an unknown id.
 *
 * Both return pristine bundled Problems read from SQLite. Personalization
 * (Overrides, Tombstones, custom Problems) arrives with authentication later.
 */
export function createProblemsRouter(db: Db) {
  const router = new Hono<{ Variables: RequestLoggerVariables }>();

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
    return c.json(listProblems(db, parsed.value));
  });

  router.get("/:id", (c) => {
    const problem = getProblem(db, c.req.param("id"));
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
