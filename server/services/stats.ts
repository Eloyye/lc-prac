import { and, asc, eq, sql } from "drizzle-orm";
import type { HistoryFilters, SavedBestScore, StatsSummary } from "../../shared/types";
import type { Db } from "../db/client";
import { attempts, bestScores } from "../db/schema";
import { listAttempts, toBestScore } from "./attempts";

/** Read Mode-specific PBs without ever crossing the authenticated owner boundary. */
export function listBestScores(
  db: Db,
  userId: string,
  filters: HistoryFilters = {},
): SavedBestScore[] {
  return db
    .select()
    .from(bestScores)
    .where(
      and(
        eq(bestScores.userId, userId),
        filters.problemId === undefined ? undefined : eq(bestScores.problemId, filters.problemId),
        filters.solutionId === undefined
          ? undefined
          : eq(bestScores.solutionId, filters.solutionId),
        filters.mode === undefined ? undefined : eq(bestScores.mode, filters.mode),
      ),
    )
    .orderBy(asc(bestScores.problemId), asc(bestScores.solutionId), asc(bestScores.mode))
    .all()
    .map(toBestScore);
}

/** Calculate the signed-in user's aggregate practice summary in SQLite. */
export function getStatsSummary(
  db: Db,
  userId: string,
  filters: HistoryFilters = {},
): StatsSummary {
  const where = and(
    eq(attempts.userId, userId),
    filters.problemId === undefined ? undefined : eq(attempts.problemId, filters.problemId),
    filters.solutionId === undefined ? undefined : eq(attempts.solutionId, filters.solutionId),
    filters.mode === undefined ? undefined : eq(attempts.mode, filters.mode),
  );
  const aggregate = db
    .select({
      totalAttempts: sql<number>`count(*)`.mapWith(Number),
      practicedProblemCount: sql<number>`count(distinct ${attempts.problemId})`.mapWith(Number),
      averageCpm: sql<number>`coalesce(avg(${attempts.cpm}), 0)`.mapWith(Number),
      averageAccuracyPct: sql<number>`coalesce(avg(${attempts.accuracyPct}), 0)`.mapWith(Number),
      bestCpm: sql<number>`coalesce(max(${attempts.cpm}), 0)`.mapWith(Number),
      totalPracticeTimeMs: sql<number>`coalesce(sum(${attempts.durationMs}), 0)`.mapWith(Number),
    })
    .from(attempts)
    .where(where)
    .get();

  if (aggregate === undefined) throw new Error("Stats aggregate query returned no row");
  return {
    ...filters,
    ...aggregate,
    recentAttempts: listAttempts(db, userId, filters, 5),
  };
}
