import { Hono } from "hono";
import type { Mode } from "../../shared/types";
import type { Db } from "../db/client";
import type { RequestLoggerVariables } from "../middleware/request-logger";
import { requireUser } from "../middleware/session";
import type { AuthVariables } from "../middleware/session";
import { createAttempt } from "../services/attempts";
import type { CreateAttemptValues } from "../services/attempts";

type RouterVariables = RequestLoggerVariables & AuthVariables;
type FieldErrors = Record<string, string[]>;
type ParsedAttempt =
  | { ok: true; value: CreateAttemptValues }
  | { ok: false; fieldErrors: FieldErrors };

const MODES = new Set<Mode>(["copy", "recall", "free"]);

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function nonNegativeInteger(value: unknown): value is number {
  return finiteNonNegative(value) && Number.isInteger(value);
}

function parseAttempt(body: unknown): ParsedAttempt {
  if (!object(body)) return { ok: false, fieldErrors: { body: ["Must be a JSON object."] } };
  const errors: FieldErrors = {};
  if (!nonEmptyString(body.id)) errors.id = ["A client-generated id is required."];
  if (!nonEmptyString(body.problemId)) errors.problemId = ["A Problem id is required."];
  if (!nonEmptyString(body.solutionId)) errors.solutionId = ["A Solution id is required."];
  if (typeof body.mode !== "string" || !MODES.has(body.mode as Mode)) {
    errors.mode = ["Must be one of copy, recall, free."];
  }

  for (const field of ["cpm", "wpm", "accuracyPct"] as const) {
    if (!finiteNonNegative(body[field])) errors[field] = ["Must be a finite non-negative number."];
  }
  if (finiteNonNegative(body.accuracyPct) && body.accuracyPct > 100) {
    errors.accuracyPct = ["Must be between 0 and 100."];
  }
  for (const field of [
    "durationMs",
    "totalKeystrokes",
    "errorKeystrokes",
    "correctChars",
  ] as const) {
    if (!nonNegativeInteger(body[field])) {
      errors[field] = ["Must be a non-negative integer."];
    }
  }
  if (
    nonNegativeInteger(body.errorKeystrokes) &&
    nonNegativeInteger(body.totalKeystrokes) &&
    body.errorKeystrokes > body.totalKeystrokes
  ) {
    errors.errorKeystrokes = ["Cannot exceed totalKeystrokes."];
  }

  let createdAtMs = Date.now();
  if (body.createdAt !== undefined) {
    if (typeof body.createdAt !== "string" || !Number.isFinite(Date.parse(body.createdAt))) {
      errors.createdAt = ["Must be a valid ISO date string."];
    } else {
      createdAtMs = Date.parse(body.createdAt);
    }
  }

  if (body.errorMap !== undefined && JSON.stringify(body.errorMap).length > 65_536) {
    errors.errorMap = ["Must be at most 64 KiB when serialized."];
  }

  if (Object.keys(errors).length > 0) return { ok: false, fieldErrors: errors };
  return {
    ok: true,
    value: {
      id: (body.id as string).trim(),
      problemId: (body.problemId as string).trim(),
      solutionId: (body.solutionId as string).trim(),
      mode: body.mode as Mode,
      cpm: body.cpm as number,
      wpm: body.wpm as number,
      accuracyPct: body.accuracyPct as number,
      durationMs: body.durationMs as number,
      totalKeystrokes: body.totalKeystrokes as number,
      errorKeystrokes: body.errorKeystrokes as number,
      correctChars: body.correctChars as number,
      ...(body.errorMap === undefined ? {} : { errorMap: body.errorMap }),
      createdAtMs,
    },
  };
}

export function createAttemptsRouter(db: Db) {
  const router = new Hono<{ Variables: RouterVariables }>();

  router.post("/", requireUser, async (c) => {
    const parsed = parseAttempt(await c.req.json().catch(() => null));
    if (!parsed.ok) {
      return c.json(
        {
          error: {
            code: "VALIDATION",
            message: "Invalid Attempt.",
            requestId: c.var.requestId,
            fieldErrors: parsed.fieldErrors,
          },
        },
        400,
      );
    }

    const result = createAttempt(db, c.var.user!.id, parsed.value);
    if (result.kind === "not-found") {
      return c.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "Problem or Solution not found.",
            requestId: c.var.requestId,
          },
        },
        404,
      );
    }
    if (result.kind === "conflict") {
      return c.json(
        {
          error: {
            code: "CONFLICT",
            message: "Attempt id is already in use.",
            requestId: c.var.requestId,
          },
        },
        409,
      );
    }

    const { created, kind: _kind, ...response } = result;
    return c.json(response, created ? 201 : 200);
  });

  return router;
}
