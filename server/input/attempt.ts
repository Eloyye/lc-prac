import { isMode, MODES } from "../../shared/domain/mode";
import type { Mode } from "../../shared/domain/mode";
import type { CreateAttemptValues } from "../services/attempts";
import {
  isFiniteNonNegativeNumber,
  isNonEmptyString,
  isNonNegativeInteger,
  isRecord,
} from "./validation";
import type { FieldErrors, Parsed } from "./validation";

export function parseAttempt(body: unknown): Parsed<CreateAttemptValues> {
  if (!isRecord(body)) return { ok: false, fieldErrors: { body: ["Must be a JSON object."] } };
  const errors: FieldErrors = {};
  if (!isNonEmptyString(body.id)) errors.id = ["A client-generated id is required."];
  if (!isNonEmptyString(body.problemId)) errors.problemId = ["A Problem id is required."];
  if (!isNonEmptyString(body.solutionId)) errors.solutionId = ["A Solution id is required."];
  if (!isMode(body.mode)) {
    errors.mode = [`Must be one of ${MODES.join(", ")}.`];
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
export function parseImportedAttempt(body: unknown): Parsed<CreateAttemptValues> {
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
