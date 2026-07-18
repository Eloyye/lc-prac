import { and, desc, eq } from "drizzle-orm";
import type {
  CreateAttemptResponse,
  HistoryFilters,
  Mode,
  SavedAttempt,
  SavedBestScore,
} from "../../shared/types";
import type { Db } from "../db/client";
import { attempts, bestScores } from "../db/schema";
import type { AttemptRow, BestScoreRow } from "../db/schema";
import { getProblem } from "./problems";

export type CreateAttemptValues = {
  id: string;
  problemId: string;
  solutionId: string;
  mode: Mode;
  cpm: number;
  wpm: number;
  accuracyPct: number;
  durationMs: number;
  totalKeystrokes: number;
  errorKeystrokes: number;
  correctChars: number;
  errorMap?: unknown;
  createdAtMs: number;
};

export type AttemptCreationResult =
  | ({ kind: "ok"; created: boolean } & CreateAttemptResponse)
  | { kind: "not-found" }
  | { kind: "conflict" };

export function toAttempt(row: AttemptRow): SavedAttempt {
  return {
    id: row.id,
    problemId: row.problemId,
    solutionId: row.solutionId,
    problemTitle: row.problemTitle,
    solutionApproach: row.solutionApproach,
    mode: row.mode,
    cpm: row.cpm,
    wpm: row.wpm,
    accuracyPct: row.accuracyPct,
    durationMs: row.durationMs,
    totalKeystrokes: row.totalKeystrokes,
    errorKeystrokes: row.errorKeystrokes,
    correctChars: row.correctChars,
    ...(row.errorMapJson === null ? {} : { errorMap: JSON.parse(row.errorMapJson) as unknown }),
    createdAt: new Date(row.createdAtMs).toISOString(),
  };
}

export function toBestScore(row: BestScoreRow): SavedBestScore {
  return {
    problemId: row.problemId,
    solutionId: row.solutionId,
    mode: row.mode,
    bestCpm: row.bestCpm,
    bestAccuracyPct: row.bestAccuracyPct,
    bestDurationMs: row.bestDurationMs,
    attemptId: row.attemptId,
    updatedAt: new Date(row.updatedAtMs).toISOString(),
  };
}

/** Read only one account's immutable Attempt history, newest first. */
export function listAttempts(
  db: Db,
  userId: string,
  filters: HistoryFilters = {},
  limit?: number,
): SavedAttempt[] {
  const query = db
    .select()
    .from(attempts)
    .where(
      and(
        eq(attempts.userId, userId),
        filters.problemId === undefined ? undefined : eq(attempts.problemId, filters.problemId),
        filters.solutionId === undefined ? undefined : eq(attempts.solutionId, filters.solutionId),
        filters.mode === undefined ? undefined : eq(attempts.mode, filters.mode),
      ),
    )
    .orderBy(desc(attempts.createdAtMs), desc(attempts.id));
  return (limit === undefined ? query.all() : query.limit(limit).all()).map(toAttempt);
}

function bestForRow(db: Db, userId: string, row: AttemptRow): BestScoreRow | undefined {
  return db
    .select()
    .from(bestScores)
    .where(
      and(
        eq(bestScores.userId, userId),
        eq(bestScores.problemId, row.problemId),
        eq(bestScores.solutionId, row.solutionId),
        eq(bestScores.mode, row.mode),
      ),
    )
    .get();
}

/** CPM ranks first, then accuracy, then the shorter duration. */
function outranks(values: CreateAttemptValues, best: BestScoreRow): boolean {
  if (values.cpm !== best.bestCpm) return values.cpm > best.bestCpm;
  if (values.accuracyPct !== best.bestAccuracyPct) {
    return values.accuracyPct > best.bestAccuracyPct;
  }
  return values.durationMs < best.bestDurationMs;
}

/**
 * Store an immutable Attempt and derive its Mode-specific Personal Best in one
 * transaction. Replaying an owned id returns the original row without writing.
 */
export function createAttempt(
  db: Db,
  userId: string,
  values: CreateAttemptValues,
): AttemptCreationResult {
  return db.transaction((tx) => {
    const existing = tx.select().from(attempts).where(eq(attempts.id, values.id)).get();
    if (existing !== undefined) {
      if (existing.userId !== userId) return { kind: "conflict" };
      const best = bestForRow(tx as Db, userId, existing);
      if (best === undefined) throw new Error("Attempt is missing its Personal Best row");
      return {
        kind: "ok",
        created: false,
        attempt: toAttempt(existing),
        bestScore: toBestScore(best),
        isPersonalBest: best.attemptId === existing.id,
      };
    }

    const problem = getProblem(tx as Db, values.problemId, userId);
    const solution = problem?.solutions.find((candidate) => candidate.id === values.solutionId);
    if (problem === null || problem === undefined || solution === undefined) {
      return { kind: "not-found" };
    }

    const row: AttemptRow = {
      id: values.id,
      userId,
      problemId: values.problemId,
      solutionId: values.solutionId,
      problemTitle: problem.title,
      solutionApproach: solution.approach,
      mode: values.mode,
      cpm: values.cpm,
      wpm: values.wpm,
      accuracyPct: values.accuracyPct,
      durationMs: values.durationMs,
      totalKeystrokes: values.totalKeystrokes,
      errorKeystrokes: values.errorKeystrokes,
      correctChars: values.correctChars,
      errorMapJson: values.errorMap === undefined ? null : JSON.stringify(values.errorMap),
      createdAtMs: values.createdAtMs,
    };
    tx.insert(attempts).values(row).run();

    const currentBest = bestForRow(tx as Db, userId, row);
    const isPersonalBest = currentBest === undefined || outranks(values, currentBest);
    if (currentBest === undefined) {
      tx.insert(bestScores)
        .values({
          userId,
          problemId: values.problemId,
          solutionId: values.solutionId,
          mode: values.mode,
          bestCpm: values.cpm,
          bestAccuracyPct: values.accuracyPct,
          bestDurationMs: values.durationMs,
          attemptId: values.id,
          updatedAtMs: values.createdAtMs,
        })
        .run();
    } else if (isPersonalBest) {
      tx.update(bestScores)
        .set({
          bestCpm: values.cpm,
          bestAccuracyPct: values.accuracyPct,
          bestDurationMs: values.durationMs,
          attemptId: values.id,
          updatedAtMs: values.createdAtMs,
        })
        .where(
          and(
            eq(bestScores.userId, userId),
            eq(bestScores.problemId, values.problemId),
            eq(bestScores.solutionId, values.solutionId),
            eq(bestScores.mode, values.mode),
          ),
        )
        .run();
    }

    const best = bestForRow(tx as Db, userId, row);
    if (best === undefined) throw new Error("Personal Best update failed");
    return {
      kind: "ok",
      created: true,
      attempt: toAttempt(row),
      bestScore: toBestScore(best),
      isPersonalBest,
    };
  });
}
