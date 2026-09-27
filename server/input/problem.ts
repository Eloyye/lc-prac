import {
  DIFFICULTIES,
  isDifficulty,
  isOrigin,
  isProblemStatus,
  ORIGINS,
  PROBLEM_STATUSES,
} from "../../shared/domain/problem";
import type { Problem } from "../../shared/domain/problem";
import type { ProblemListQuery } from "../../shared/api/problems";
import { MAX_LIMIT } from "../services/problems";
import { isNonEmptyString, isRecord } from "./validation";
import type { FieldErrors, Parsed } from "./validation";

function present(value: string | undefined): string | undefined {
  return value !== undefined && value !== "" ? value : undefined;
}

/** Parse the Library list query; empty parameters count as absent. */
export function parseProblemListQuery(raw: Record<string, string>): Parsed<ProblemListQuery> {
  const fieldErrors: FieldErrors = {};
  const value: ProblemListQuery = {};
  const q = present(raw.q);
  if (q !== undefined) value.q = q;
  const tag = present(raw.tag);
  if (tag !== undefined) value.tag = tag;
  const cursor = present(raw.cursor);
  if (cursor !== undefined) value.cursor = cursor;

  const difficulty = present(raw.difficulty);
  if (difficulty !== undefined) {
    if (isDifficulty(difficulty)) value.difficulty = difficulty;
    else fieldErrors.difficulty = [`Must be one of ${DIFFICULTIES.join(", ")}.`];
  }
  const origin = present(raw.origin);
  if (origin !== undefined) {
    if (isOrigin(origin)) value.origin = origin;
    else fieldErrors.origin = [`Must be one of ${ORIGINS.join(", ")}.`];
  }
  const status = present(raw.status);
  if (status !== undefined) {
    if (isProblemStatus(status)) value.status = status;
    else fieldErrors.status = [`Must be one of ${PROBLEM_STATUSES.join(", ")}.`];
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
export function parseProblem(
  body: unknown,
  origin: Problem["origin"],
  routeId?: string,
): Parsed<Problem> {
  if (!isRecord(body)) return { ok: false, fieldErrors: { body: ["Must be a JSON object."] } };
  const errors: FieldErrors = {};
  if (!isNonEmptyString(body.id)) errors.id = ["A non-empty id is required."];
  else if (routeId !== undefined && body.id !== routeId) errors.id = ["Must match the route id."];
  if (!isNonEmptyString(body.title)) errors.title = ["A non-empty title is required."];
  if (!isDifficulty(body.difficulty)) {
    errors.difficulty = [`Must be one of ${DIFFICULTIES.join(", ")}.`];
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
