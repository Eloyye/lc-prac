import { and, eq, inArray, isNull } from "drizzle-orm";
import type { Example, Problem, Solution } from "../../src/types";
import { filterProblems } from "../../src/content/filter";
import type { Db } from "../db/client";
import { problemExamples, problems, problemTags, solutions, tags } from "../db/schema";
import type { ProblemExampleRow, ProblemRow, SolutionRow } from "../db/schema";

export type ListProblemsQuery = {
  q?: string;
  difficulty?: "easy" | "medium" | "hard";
  tag?: string;
  origin?: "bundled" | "custom";
  status?: "active" | "archived";
  limit?: number;
  cursor?: string;
};

export type ProblemListResult = {
  problems: Problem[];
  nextCursor: string | null;
};

/** Page size when the caller does not specify `limit`; also the hard ceiling. */
export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 100;

function toSolutionDto(row: SolutionRow): Solution {
  const solution: Solution = {
    id: row.id,
    lang: row.lang,
    approach: row.approach,
    code: row.code,
  };
  // Optional fields are omitted (not set to undefined) so a DTO round-trips to
  // the exact shape of the bundled source.
  if (row.timeComplexity !== null) solution.timeComplexity = row.timeComplexity;
  if (row.spaceComplexity !== null) solution.spaceComplexity = row.spaceComplexity;
  return solution;
}

function toExampleDto(row: ProblemExampleRow): Example {
  const example: Example = { input: row.input, output: row.output };
  if (row.explanation !== null) example.explanation = row.explanation;
  return example;
}

function toProblemDto(
  row: ProblemRow,
  rowSolutions: SolutionRow[],
  rowExamples: ProblemExampleRow[],
  tagNames: string[],
): Problem {
  const problem: Problem = {
    id: row.id,
    title: row.title,
    difficulty: row.difficulty,
    tags: tagNames,
    origin: row.origin,
    solutions: rowSolutions.map(toSolutionDto),
  };
  if (row.url !== null) problem.url = row.url;
  if (row.statement !== null) problem.statement = row.statement;
  if (row.expectedTime !== null) problem.expectedTime = row.expectedTime;
  if (row.expectedSpace !== null) problem.expectedSpace = row.expectedSpace;
  // The bundled source omits `examples` entirely when there are none; match that.
  if (rowExamples.length > 0) problem.examples = rowExamples.map(toExampleDto);
  return problem;
}

/** Group child rows by `problemId` into a Map, preserving query order. */
function groupBy<T extends { problemId: string }>(rows: T[]): Map<string, T[]> {
  const byProblem = new Map<string, T[]>();
  for (const row of rows) {
    const list = byProblem.get(row.problemId);
    if (list === undefined) {
      byProblem.set(row.problemId, [row]);
    } else {
      list.push(row);
    }
  }
  return byProblem;
}

/**
 * Assemble full Problem DTOs for the given Problem rows, loading their Solutions,
 * examples, and tags in three batched queries (no per-Problem N+1). Children are
 * ordered by their stored `sortOrder` so authored ordering is preserved.
 */
function assembleProblems(db: Db, rows: ProblemRow[]): Problem[] {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);

  const solutionRows = db
    .select()
    .from(solutions)
    .where(inArray(solutions.problemId, ids))
    .orderBy(solutions.problemId, solutions.sortOrder)
    .all();
  const exampleRows = db
    .select()
    .from(problemExamples)
    .where(inArray(problemExamples.problemId, ids))
    .orderBy(problemExamples.problemId, problemExamples.sortOrder)
    .all();
  const tagRows = db
    .select({ problemId: problemTags.problemId, name: tags.name })
    .from(problemTags)
    .innerJoin(tags, eq(problemTags.tagId, tags.id))
    .where(inArray(problemTags.problemId, ids))
    .orderBy(problemTags.problemId, problemTags.sortOrder)
    .all();

  const solutionsByProblem = groupBy(solutionRows);
  const examplesByProblem = groupBy(exampleRows);
  const tagsByProblem = groupBy(tagRows);

  return rows.map((row) =>
    toProblemDto(
      row,
      solutionsByProblem.get(row.id) ?? [],
      examplesByProblem.get(row.id) ?? [],
      (tagsByProblem.get(row.id) ?? []).map((tag) => tag.name),
    ),
  );
}

/** Active bundled Problems in authored Library order (the anonymous read model). */
function loadActiveBundledProblems(db: Db): Problem[] {
  const rows = db
    .select()
    .from(problems)
    .where(and(eq(problems.origin, "bundled"), isNull(problems.archivedAtMs)))
    .orderBy(problems.createdAtMs, problems.id)
    .all();
  return assembleProblems(db, rows);
}

/**
 * The caller's effective Library list. For anonymous callers this is the pristine
 * bundled Library; the `q` / `difficulty` / `tag` / `origin` filters use the same
 * semantics as the client's `filterProblems`, and `limit` / `cursor` paginate the
 * filtered result. `nextCursor` is the id to pass as the next `cursor`, or null
 * when the page is the last one.
 */
export function listProblems(db: Db, query: ListProblemsQuery = {}): ProblemListResult {
  // Archived bundled Problems do not exist (only custom Problems archive), so an
  // explicit `status=archived` request yields nothing for the anonymous library.
  if (query.status === "archived") {
    return { problems: [], nextCursor: null };
  }

  const all = loadActiveBundledProblems(db);
  let filtered = filterProblems(all, {
    query: query.q ?? "",
    difficulty: query.difficulty ?? "all",
    tag: query.tag ?? null,
  });
  if (query.origin !== undefined) {
    filtered = filtered.filter((problem) => problem.origin === query.origin);
  }

  const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  // An unknown cursor (e.g. a since-removed Problem) restarts from the top rather
  // than erroring — the list endpoint stays resilient to stale links.
  const startIndex =
    query.cursor !== undefined ? filtered.findIndex((p) => p.id === query.cursor) + 1 : 0;
  const page = filtered.slice(startIndex, startIndex + limit);
  const reachedEnd = startIndex + page.length >= filtered.length;
  const nextCursor = reachedEnd || page.length === 0 ? null : page[page.length - 1]!.id;

  return { problems: page, nextCursor };
}

/**
 * One readable effective Problem by its logical id, or null when no active
 * bundled Problem has that id (a bad URL, or a future Tombstoned/archived one).
 */
export function getProblem(db: Db, id: string): Problem | null {
  const row = db
    .select()
    .from(problems)
    .where(and(eq(problems.id, id), eq(problems.origin, "bundled"), isNull(problems.archivedAtMs)))
    .get();
  if (row === undefined) return null;
  return assembleProblems(db, [row])[0] ?? null;
}
