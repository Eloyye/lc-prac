import { Hono } from "hono";
import type { Mode } from "../../shared/types";
import type { Db } from "../db/client";
import type { RequestLoggerVariables } from "../middleware/request-logger";
import { requireUser } from "../middleware/session";
import type { AuthVariables } from "../middleware/session";
import { createAttempt, listAttempts } from "../services/attempts";
import type { CreateAttemptValues } from "../services/attempts";
import { parseHistoryQuery } from "./history-query";
import {
  isFiniteNonNegativeNumber,
  isNonEmptyString,
  isNonNegativeInteger,
  isRecord,
} from "./validation";
import type { FieldErrors } from "./validation";

type RouterVariables = RequestLoggerVariables & AuthVariables;
export type ParsedAttempt =
  | { ok: true; value: CreateAttemptValues }
  | { ok: false; fieldErrors: FieldErrors };

const MODES = new Set<Mode>(["copy", "recall", "free"]);

export function parseAttempt(body: unknown): ParsedAttempt {
  if (!isRecord(body)) return { ok: false, fieldErrors: { body: ["Must be a JSON object."] } };
  const errors: FieldErrors = {};
  if (!isNonEmptyString(body.id)) errors.id = ["A client-generated id is required."];
  if (!isNonEmptyString(body.problemId)) errors.problemId = ["A Problem id is required."];
  if (!isNonEmptyString(body.solutionId)) errors.solutionId = ["A Solution id is required."];
  if (typeof body.mode !== "string" || !MODES.has(body.mode as Mode)) {
    errors.mode = ["Must be one of copy, recall, free."];
  }

  for (const field of ["cpm", "wpm", "accuracyPct"] as const) {
    if (!isFiniteNonNegativeNumber(body[field])) {
      errors[field] = ["Must be a finite non-negative number."];
    }
  }
  if (isFiniteNonNegativeNumber(body.accuracyPct) && body.accuracyPct > 100) {
    errors.accuracyPct = ["Must be between 0 and 100."];
  }
  for (const field of [
    "durationMs",
    "totalKeystrokes",
    "errorKeystrokes",
    "correctChars",
  ] as const) {
    if (!isNonNegativeInteger(body[field])) {
      errors[field] = ["Must be a non-negative integer."];
    }
  }
  if (
    isNonNegativeInteger(body.errorKeystrokes) &&
    isNonNegativeInteger(body.totalKeystrokes) &&
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

/**
 * Normalize a versioned browser-local Attempt before applying the same strict
 * validation as a newly completed Session. Older rows default to Copy mode and
 * derive counters that were not persisted before the authenticated Attempt API.
 */
export function parseImportedAttempt(body: unknown): ParsedAttempt {
  if (!isRecord(body)) return { ok: false, fieldErrors: { body: ["Must be a JSON object."] } };

  const normalized: Record<string, unknown> = {
    ...body,
    mode: body.mode ?? "copy",
  };
  const counters = [body.totalKeystrokes, body.errorKeystrokes, body.correctChars];
  if (counters.every((value) => value === undefined)) {
    if (
      isFiniteNonNegativeNumber(body.cpm) &&
      isFiniteNonNegativeNumber(body.accuracyPct) &&
      body.accuracyPct <= 100 &&
      isNonNegativeInteger(body.durationMs)
    ) {
      const correctChars = Math.max(0, Math.round((body.cpm * body.durationMs) / 60_000));
      const totalKeystrokes =
        body.accuracyPct > 0
          ? Math.max(correctChars, Math.round(correctChars / (body.accuracyPct / 100)))
          : correctChars;
      normalized.correctChars = correctChars;
      normalized.totalKeystrokes = totalKeystrokes;
      normalized.errorKeystrokes = totalKeystrokes - correctChars;
    }
  }
  return parseAttempt(normalized);
}

export function createAttemptsRouter(db: Db) {
  const router = new Hono<{ Variables: RouterVariables }>();

  router.get("/", requireUser, (c) => {
    const parsed = parseHistoryQuery(c.req.query(), { allowLimit: true });
    if (!parsed.ok) {
      return c.json(
        {
          error: {
            code: "VALIDATION",
            message: "Invalid history filters.",
            requestId: c.var.requestId,
            fieldErrors: parsed.fieldErrors,
          },
        },
        400,
      );
    }
    return c.json({
      attempts: listAttempts(db, c.var.user!.id, parsed.filters, parsed.limit),
    });
  });

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
