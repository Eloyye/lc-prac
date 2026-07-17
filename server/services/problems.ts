import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import type { Example, Problem, Solution } from "../../shared/types";
import { filterProblems } from "../../shared/content/filter";
import type { Db } from "../db/client";
import {
  attempts,
  bestScores,
  problemExamples,
  problemOverrides,
  problems,
  problemTags,
  problemTombstones,
  solutions,
  tags,
} from "../db/schema";
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
  personalization: ProblemPersonalization | null;
};

export type ProblemPersonalization = {
  overriddenProblemIds: string[];
  hiddenProblems: Problem[];
};

export type CustomProblemMutationResult =
  | { kind: "ok"; problem: Problem }
  | { kind: "not-found" }
  | { kind: "conflict" };

/** Page size when the caller does not specify `limit`; also the hard ceiling. */
export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 100;

const tagId = (name: string): string => `tag:${name}`;

function toSolutionDto(row: SolutionRow): Solution {
  const solution: Solution = {
    id: row.id,
    lang: row.lang,
    approach: row.approach,
    code: row.code,
  };
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
  if (rowExamples.length > 0) problem.examples = rowExamples.map(toExampleDto);
  return problem;
}

function groupBy<T extends { problemId: string }>(rows: T[]): Map<string, T[]> {
  const byProblem = new Map<string, T[]>();
  for (const row of rows) {
    const list = byProblem.get(row.problemId);
    if (list === undefined) byProblem.set(row.problemId, [row]);
    else list.push(row);
  }
  return byProblem;
}

/** Load child collections in batches and assemble complete Problem DTOs. */
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

function loadBundledRows(db: Db): ProblemRow[] {
  return db
    .select()
    .from(problems)
    .where(and(eq(problems.origin, "bundled"), isNull(problems.archivedAtMs)))
    .orderBy(problems.createdAtMs, problems.id)
    .all();
}

function loadPersonalization(
  db: Db,
  bundled: Problem[],
  userId: string,
): { active: Problem[]; metadata: ProblemPersonalization } {
  const overrideRows = db
    .select()
    .from(problemOverrides)
    .where(eq(problemOverrides.userId, userId))
    .all();
  const tombstoneRows = db
    .select()
    .from(problemTombstones)
    .where(eq(problemTombstones.userId, userId))
    .all();
  const overrides = new Map(
    overrideRows.map((row) => [row.bundledProblemId, JSON.parse(row.snapshotJson) as Problem]),
  );
  const hiddenIds = new Set(tombstoneRows.map((row) => row.bundledProblemId));
  const effective = bundled.map((problem) => overrides.get(problem.id) ?? problem);
  return {
    active: effective.filter((problem) => !hiddenIds.has(problem.id)),
    metadata: {
      overriddenProblemIds: overrideRows.map((row) => row.bundledProblemId),
      hiddenProblems: effective.filter((problem) => hiddenIds.has(problem.id)),
    },
  };
}

function loadOwnedCustomRows(
  db: Db,
  userId: string | undefined,
  status: "active" | "archived",
): ProblemRow[] {
  if (userId === undefined) return [];
  return db
    .select()
    .from(problems)
    .where(
      and(
        eq(problems.origin, "custom"),
        eq(problems.ownerUserId, userId),
        status === "active" ? isNull(problems.archivedAtMs) : isNotNull(problems.archivedAtMs),
      ),
    )
    .orderBy(problems.createdAtMs, problems.id)
    .all();
}

/** The effective active Library, or the caller's archived custom Problems. */
export function listProblems(
  db: Db,
  query: ListProblemsQuery = {},
  userId?: string,
): ProblemListResult {
  const status = query.status ?? "active";
  const bundled = status === "active" ? assembleProblems(db, loadBundledRows(db)) : [];
  const personalized =
    status === "active" && userId !== undefined ? loadPersonalization(db, bundled, userId) : null;
  const custom = assembleProblems(db, loadOwnedCustomRows(db, userId, status));
  let filtered = filterProblems([...(personalized?.active ?? bundled), ...custom], {
    query: query.q ?? "",
    difficulty: query.difficulty ?? "all",
    tag: query.tag ?? null,
  });
  if (query.origin !== undefined) {
    filtered = filtered.filter((problem) => problem.origin === query.origin);
  }

  const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  const cursorIndex =
    query.cursor === undefined ? -1 : filtered.findIndex((p) => p.id === query.cursor);
  const startIndex = cursorIndex + 1;
  const page = filtered.slice(startIndex, startIndex + limit);
  const reachedEnd = startIndex + page.length >= filtered.length;
  return {
    problems: page,
    nextCursor: reachedEnd || page.length === 0 ? null : page[page.length - 1]!.id,
    personalization: personalized?.metadata ?? null,
  };
}

/** One effective active Problem readable by the caller. */
export function getProblem(db: Db, id: string, userId?: string): Problem | null {
  const row = db.select().from(problems).where(eq(problems.id, id)).get();
  if (
    row === undefined ||
    row.archivedAtMs !== null ||
    (row.origin === "custom" && row.ownerUserId !== userId)
  ) {
    return null;
  }
  const problem = assembleProblems(db, [row])[0] ?? null;
  if (problem === null || row.origin === "custom" || userId === undefined) return problem;

  const tombstone = db
    .select({ id: problemTombstones.bundledProblemId })
    .from(problemTombstones)
    .where(and(eq(problemTombstones.userId, userId), eq(problemTombstones.bundledProblemId, id)))
    .get();
  if (tombstone !== undefined) return null;

  const override = db
    .select({ snapshotJson: problemOverrides.snapshotJson })
    .from(problemOverrides)
    .where(and(eq(problemOverrides.userId, userId), eq(problemOverrides.bundledProblemId, id)))
    .get();
  return override === undefined ? problem : (JSON.parse(override.snapshotJson) as Problem);
}

function bundledProblemExists(db: Db, id: string): boolean {
  return (
    db
      .select({ id: problems.id })
      .from(problems)
      .where(and(eq(problems.id, id), eq(problems.origin, "bundled")))
      .get() !== undefined
  );
}

export function saveProblemOverride(
  db: Db,
  userId: string,
  snapshot: Problem,
  now = Date.now(),
): boolean {
  if (!bundledProblemExists(db, snapshot.id)) return false;
  db.insert(problemOverrides)
    .values({
      userId,
      bundledProblemId: snapshot.id,
      snapshotJson: JSON.stringify(snapshot),
      updatedAtMs: now,
    })
    .onConflictDoUpdate({
      target: [problemOverrides.userId, problemOverrides.bundledProblemId],
      set: { snapshotJson: JSON.stringify(snapshot), updatedAtMs: now },
    })
    .run();
  return true;
}

export function hideBundledProblem(db: Db, userId: string, id: string, now = Date.now()): boolean {
  if (!bundledProblemExists(db, id)) return false;
  db.insert(problemTombstones)
    .values({ userId, bundledProblemId: id, hiddenAtMs: now })
    .onConflictDoNothing()
    .run();
  return true;
}

export function restoreBundledProblem(db: Db, userId: string, id: string): boolean {
  if (!bundledProblemExists(db, id)) return false;
  db.delete(problemTombstones)
    .where(and(eq(problemTombstones.userId, userId), eq(problemTombstones.bundledProblemId, id)))
    .run();
  return true;
}

export function resetBundledProblem(db: Db, userId: string, id: string): boolean {
  if (!bundledProblemExists(db, id)) return false;
  db.delete(problemOverrides)
    .where(and(eq(problemOverrides.userId, userId), eq(problemOverrides.bundledProblemId, id)))
    .run();
  return true;
}

function ownedCustomRow(db: Db, id: string, userId: string): ProblemRow | undefined {
  return db
    .select()
    .from(problems)
    .where(
      and(eq(problems.id, id), eq(problems.origin, "custom"), eq(problems.ownerUserId, userId)),
    )
    .get();
}

function replaceChildren(db: Db, problem: Problem, now: number): void {
  db.delete(solutions).where(eq(solutions.problemId, problem.id)).run();
  db.delete(problemExamples).where(eq(problemExamples.problemId, problem.id)).run();
  db.delete(problemTags).where(eq(problemTags.problemId, problem.id)).run();

  problem.solutions.forEach((solution, index) => {
    db.insert(solutions)
      .values({
        id: solution.id,
        problemId: problem.id,
        lang: solution.lang,
        approach: solution.approach,
        code: solution.code,
        timeComplexity: solution.timeComplexity ?? null,
        spaceComplexity: solution.spaceComplexity ?? null,
        sortOrder: index,
        createdAtMs: now,
        updatedAtMs: now,
      })
      .run();
  });
  (problem.examples ?? []).forEach((example, index) => {
    db.insert(problemExamples)
      .values({
        id: `${problem.id}-example-${index}`,
        problemId: problem.id,
        input: example.input,
        output: example.output,
        explanation: example.explanation ?? null,
        sortOrder: index,
      })
      .run();
  });
  problem.tags.forEach((name, index) => {
    db.insert(tags)
      .values({ id: tagId(name), name })
      .onConflictDoNothing()
      .run();
    db.insert(problemTags)
      .values({ problemId: problem.id, tagId: tagId(name), sortOrder: index })
      .run();
  });
}

/** Create a complete custom Problem owned by the authenticated caller. */
export function createCustomProblem(
  db: Db,
  userId: string,
  problem: Problem,
  now = Date.now(),
): CustomProblemMutationResult {
  if (db.select({ id: problems.id }).from(problems).where(eq(problems.id, problem.id)).get()) {
    return { kind: "conflict" };
  }
  const childIds = problem.solutions.map((solution) => solution.id);
  if (
    childIds.length > 0 &&
    db.select({ id: solutions.id }).from(solutions).where(inArray(solutions.id, childIds)).get()
  ) {
    return { kind: "conflict" };
  }

  db.transaction((tx) => {
    tx.insert(problems)
      .values({
        id: problem.id,
        slug: null,
        title: problem.title,
        difficulty: problem.difficulty,
        origin: "custom",
        ownerUserId: userId,
        url: problem.url ?? null,
        statement: problem.statement ?? null,
        expectedTime: problem.expectedTime ?? null,
        expectedSpace: problem.expectedSpace ?? null,
        archivedAtMs: null,
        createdAtMs: now,
        updatedAtMs: now,
      })
      .run();
    replaceChildren(tx as Db, problem, now);
  });
  return { kind: "ok", problem };
}

/** Replace the complete editable content of one active, owned custom Problem. */
export function updateCustomProblem(
  db: Db,
  userId: string,
  id: string,
  problem: Problem,
  now = Date.now(),
): CustomProblemMutationResult {
  const row = ownedCustomRow(db, id, userId);
  if (row === undefined || row.archivedAtMs !== null) return { kind: "not-found" };
  const childIds = problem.solutions.map((solution) => solution.id);
  const conflictingSolution =
    childIds.length === 0
      ? undefined
      : db
          .select({ id: solutions.id, problemId: solutions.problemId })
          .from(solutions)
          .where(inArray(solutions.id, childIds))
          .all()
          .find((solution) => solution.problemId !== id);
  if (conflictingSolution !== undefined) return { kind: "conflict" };

  db.transaction((tx) => {
    tx.update(problems)
      .set({
        title: problem.title,
        difficulty: problem.difficulty,
        url: problem.url ?? null,
        statement: problem.statement ?? null,
        expectedTime: problem.expectedTime ?? null,
        expectedSpace: problem.expectedSpace ?? null,
        updatedAtMs: now,
      })
      .where(eq(problems.id, id))
      .run();
    replaceChildren(tx as Db, problem, now);
  });
  return { kind: "ok", problem };
}

export function archiveCustomProblem(
  db: Db,
  userId: string,
  id: string,
  now = Date.now(),
): CustomProblemMutationResult {
  const row = ownedCustomRow(db, id, userId);
  if (row === undefined || row.archivedAtMs !== null) return { kind: "not-found" };
  db.update(problems).set({ archivedAtMs: now, updatedAtMs: now }).where(eq(problems.id, id)).run();
  return {
    kind: "ok",
    problem: assembleProblems(db, [{ ...row, archivedAtMs: now, updatedAtMs: now }])[0]!,
  };
}

export function restoreCustomProblem(
  db: Db,
  userId: string,
  id: string,
  now = Date.now(),
): CustomProblemMutationResult {
  const row = ownedCustomRow(db, id, userId);
  if (row === undefined || row.archivedAtMs === null) return { kind: "not-found" };
  db.update(problems)
    .set({ archivedAtMs: null, updatedAtMs: now })
    .where(eq(problems.id, id))
    .run();
  return {
    kind: "ok",
    problem: assembleProblems(db, [{ ...row, archivedAtMs: null, updatedAtMs: now }])[0]!,
  };
}

/** Delete only an already-archived custom Problem owned by the caller. */
export function permanentlyDeleteCustomProblem(db: Db, userId: string, id: string): boolean {
  const row = ownedCustomRow(db, id, userId);
  if (row === undefined || row.archivedAtMs === null) return false;
  db.transaction((tx) => {
    tx.delete(bestScores)
      .where(and(eq(bestScores.userId, userId), eq(bestScores.problemId, id)))
      .run();
    tx.delete(attempts)
      .where(and(eq(attempts.userId, userId), eq(attempts.problemId, id)))
      .run();
    tx.delete(problems).where(eq(problems.id, id)).run();
  });
  return true;
}
