import type { HistoryFilters } from "../../shared/api/history";
import { isMode, MODES } from "../../shared/domain/mode";
import type { FieldErrors } from "../../shared/api/errors";

export type ParsedHistoryQuery =
  | { ok: true; filters: HistoryFilters; limit?: number }
  | { ok: false; fieldErrors: FieldErrors };

/** Parse the common history/PB/summary filters at the HTTP boundary. */
export function parseHistoryQuery(
  query: Record<string, string>,
  options: { allowLimit?: boolean } = {},
): ParsedHistoryQuery {
  const fieldErrors: FieldErrors = {};
  const filters: HistoryFilters = {};

  for (const field of ["problemId", "solutionId"] as const) {
    const raw = query[field];
    if (raw === undefined) continue;
    const value = raw.trim();
    if (value === "") fieldErrors[field] = ["Must not be empty."];
    else filters[field] = value;
  }

  if (query.mode !== undefined) {
    if (!isMode(query.mode)) {
      fieldErrors.mode = [`Must be one of ${MODES.join(", ")}.`];
    } else {
      filters.mode = query.mode;
    }
  }

  let limit: number | undefined;
  if (query.limit !== undefined) {
    const parsed = Number(query.limit);
    if (!options.allowLimit || !Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
      fieldErrors.limit = ["Must be an integer between 1 and 100."];
    } else {
      limit = parsed;
    }
  }

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
  return { ok: true, filters, limit };
}
