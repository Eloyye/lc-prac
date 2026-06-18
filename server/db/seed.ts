import { pathToFileURL } from "node:url";
import { eq } from "drizzle-orm";
import type { Problem } from "../../src/types";
import { PROBLEMS } from "../../src/content/problems";
import { parseEnv } from "../env";
import { openDatabase } from "./client";
import type { Db } from "./client";
import { runMigrations } from "./migrate";
import { problemExamples, problems, problemTags, solutions, tags } from "./schema";

/**
 * Tags are global and identified by their normalized name. Deriving the row id
 * from the name keeps the seed idempotent (a re-seed reuses the same id) without
 * a lookup, and the id is never surfaced in the API — the DTO carries tag names.
 */
const tagId = (name: string): string => `tag:${name}`;

/**
 * Import the bundled Problems into the database. Idempotent: each Problem is
 * upserted by its stable logical id and its child rows (Solutions, examples,
 * tags) are replaced, so re-running mirrors the current bundled source exactly —
 * without duplicating rows, dropping metadata, or changing any logical id. A
 * Problem's `createdAtMs` is preserved across re-seeds so the authored Library
 * order stays stable. The whole import runs in one transaction.
 *
 * Returns the number of Problems imported.
 */
export function seedBundledProblems(db: Db, source: Problem[], now: number = Date.now()): number {
  db.transaction((tx) => {
    source.forEach((problem, problemIndex) => {
      // New rows are stamped in authored order so the list API can reproduce the
      // bundled Library order by `createdAtMs`; existing rows keep their stamp.
      const createdAtMs = now + problemIndex;

      tx.insert(problems)
        .values({
          id: problem.id,
          slug: null,
          title: problem.title,
          difficulty: problem.difficulty,
          origin: problem.origin,
          ownerUserId: null,
          url: problem.url ?? null,
          statement: problem.statement ?? null,
          expectedTime: problem.expectedTime ?? null,
          expectedSpace: problem.expectedSpace ?? null,
          archivedAtMs: null,
          createdAtMs,
          updatedAtMs: now,
        })
        .onConflictDoUpdate({
          target: problems.id,
          set: {
            title: problem.title,
            difficulty: problem.difficulty,
            origin: problem.origin,
            url: problem.url ?? null,
            statement: problem.statement ?? null,
            expectedTime: problem.expectedTime ?? null,
            expectedSpace: problem.expectedSpace ?? null,
            updatedAtMs: now,
          },
        })
        .run();

      // Replace child rows so the database matches the bundled source exactly,
      // dropping anything the source no longer lists. Logical ids are stable in
      // source, so re-inserting reuses the same ids (cascade deletes nothing in
      // this phase — Attempts reference `solution_id` only as a logical id).
      tx.delete(solutions).where(eq(solutions.problemId, problem.id)).run();
      tx.delete(problemExamples).where(eq(problemExamples.problemId, problem.id)).run();
      tx.delete(problemTags).where(eq(problemTags.problemId, problem.id)).run();

      problem.solutions.forEach((solution, index) => {
        tx.insert(solutions)
          .values({
            id: solution.id,
            problemId: problem.id,
            lang: solution.lang,
            approach: solution.approach,
            code: solution.code,
            timeComplexity: solution.timeComplexity ?? null,
            spaceComplexity: solution.spaceComplexity ?? null,
            sortOrder: index,
            createdAtMs,
            updatedAtMs: now,
          })
          .run();
      });

      (problem.examples ?? []).forEach((example, index) => {
        tx.insert(problemExamples)
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
        tx.insert(tags)
          .values({ id: tagId(name), name })
          .onConflictDoNothing()
          .run();
        tx.insert(problemTags)
          .values({ problemId: problem.id, tagId: tagId(name), sortOrder: index })
          .run();
      });
    });
  });

  return source.length;
}

/** CLI entry: `pnpm db:seed`. Migrates first, then imports the bundled content. */
function main(): void {
  const env = parseEnv(process.env);
  const { db, close } = openDatabase(env.DB_FILE_NAME);
  try {
    runMigrations(db);
    const count = seedBundledProblems(db, PROBLEMS);
    console.log(`Seeded ${count} bundled problems into ${env.DB_FILE_NAME}`);
  } finally {
    close();
  }
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main();
}
