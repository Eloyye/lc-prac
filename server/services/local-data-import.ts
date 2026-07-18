import { and, eq } from "drizzle-orm";
import type {
  LocalDataImportCounts,
  LocalDataImportReport,
  LocalDataImportSkippedRecord,
  LocalDataImportStatusResponse,
  LocalSettingsImport,
  Problem,
} from "../../shared/types";
import type { Db } from "../db/client";
import {
  attempts,
  localDataImports,
  problemOverrides,
  problemTombstones,
  userSettings,
} from "../db/schema";
import { importAttempt } from "./attempts";
import type { CreateAttemptValues } from "./attempts";
import { hideBundledProblem, insertCustomProblem, saveProblemOverride } from "./problems";

export type ValidatedLocalDataImport = {
  customProblems: Problem[];
  overrides: Problem[];
  tombstones: string[];
  attempts: CreateAttemptValues[];
  settings?: LocalSettingsImport;
  skipped: LocalDataImportSkippedRecord[];
};

export type LocalDataImportResult =
  | { kind: "ok"; report: LocalDataImportReport; replayed: boolean }
  | { kind: "already-decided" };

const emptyCounts = (): LocalDataImportCounts => ({
  customProblems: 0,
  overrides: 0,
  tombstones: 0,
  attempts: 0,
  settings: 0,
});

function reportFromJson(value: string): LocalDataImportReport {
  return JSON.parse(value) as LocalDataImportReport;
}

export function getLocalDataImportStatus(db: Db, userId: string): LocalDataImportStatusResponse {
  const row = db
    .select({ reportJson: localDataImports.reportJson })
    .from(localDataImports)
    .where(eq(localDataImports.userId, userId))
    .get();
  return row === undefined
    ? { status: "pending" }
    : { status: "complete", report: reportFromJson(row.reportJson) };
}

function existingDecision(
  db: Db,
  userId: string,
  idempotencyToken: string,
): LocalDataImportResult | null {
  const row = db.select().from(localDataImports).where(eq(localDataImports.userId, userId)).get();
  if (row === undefined) return null;
  if (row.idempotencyToken !== idempotencyToken) return { kind: "already-decided" };
  return { kind: "ok", report: reportFromJson(row.reportJson), replayed: true };
}

function storeReport(
  db: Db,
  userId: string,
  idempotencyToken: string,
  report: LocalDataImportReport,
  completedAtMs: number,
): void {
  db.insert(localDataImports)
    .values({
      userId,
      idempotencyToken,
      decision: report.decision,
      reportJson: JSON.stringify(report),
      completedAtMs,
    })
    .run();
}

function skipped(
  collection: LocalDataImportSkippedRecord["collection"],
  id: string,
  reason: LocalDataImportSkippedRecord["reason"],
): LocalDataImportSkippedRecord {
  return { collection, id, reason };
}

/**
 * Import every accepted local record and store the immutable report in the same
 * transaction. Existing server ids are inspected before every write and win.
 */
export function importLocalData(
  db: Db,
  userId: string,
  idempotencyToken: string,
  data: ValidatedLocalDataImport,
  now = Date.now(),
): LocalDataImportResult {
  const decided = existingDecision(db, userId, idempotencyToken);
  if (decided !== null) return decided;

  return db.transaction((tx) => {
    const transactionalDb = tx as Db;
    const racedDecision = existingDecision(transactionalDb, userId, idempotencyToken);
    if (racedDecision !== null) return racedDecision;

    const imported = emptyCounts();
    const skippedRecords = [...data.skipped];

    for (const problem of data.customProblems) {
      const result = insertCustomProblem(transactionalDb, userId, problem, now);
      if (result.kind === "ok") imported.customProblems += 1;
      else skippedRecords.push(skipped("customProblems", problem.id, "conflict"));
    }

    for (const override of data.overrides) {
      const existing = transactionalDb
        .select({ id: problemOverrides.bundledProblemId })
        .from(problemOverrides)
        .where(
          and(
            eq(problemOverrides.userId, userId),
            eq(problemOverrides.bundledProblemId, override.id),
          ),
        )
        .get();
      if (existing !== undefined) {
        skippedRecords.push(skipped("overrides", override.id, "conflict"));
      } else if (saveProblemOverride(transactionalDb, userId, override, now)) {
        imported.overrides += 1;
      } else {
        skippedRecords.push(skipped("overrides", override.id, "unavailable"));
      }
    }

    // Attempts resolve Overrides but deliberately ignore Tombstones, so hidden
    // Problem history remains importable and Personal Bests derive from rows.
    for (const attempt of data.attempts) {
      const existing = transactionalDb
        .select({ id: attempts.id })
        .from(attempts)
        .where(eq(attempts.id, attempt.id))
        .get();
      if (existing !== undefined) {
        skippedRecords.push(skipped("attempts", attempt.id, "conflict"));
        continue;
      }
      const result = importAttempt(transactionalDb, userId, attempt);
      if (result.kind === "ok" && result.created) imported.attempts += 1;
      else if (result.kind === "conflict") {
        skippedRecords.push(skipped("attempts", attempt.id, "conflict"));
      } else {
        skippedRecords.push(skipped("attempts", attempt.id, "unavailable"));
      }
    }

    for (const problemId of data.tombstones) {
      const existing = transactionalDb
        .select({ id: problemTombstones.bundledProblemId })
        .from(problemTombstones)
        .where(
          and(
            eq(problemTombstones.userId, userId),
            eq(problemTombstones.bundledProblemId, problemId),
          ),
        )
        .get();
      if (existing !== undefined) {
        skippedRecords.push(skipped("tombstones", problemId, "conflict"));
      } else if (hideBundledProblem(transactionalDb, userId, problemId, now)) {
        imported.tombstones += 1;
      } else {
        skippedRecords.push(skipped("tombstones", problemId, "unavailable"));
      }
    }

    if (data.settings !== undefined) {
      const existing = transactionalDb
        .select({ userId: userSettings.userId })
        .from(userSettings)
        .where(eq(userSettings.userId, userId))
        .get();
      if (existing !== undefined) {
        skippedRecords.push(skipped("settings", "current", "conflict"));
      } else {
        transactionalDb
          .insert(userSettings)
          .values({
            userId,
            mode: data.settings.mode ?? "copy",
            distractionFree: data.settings.distractionFree ?? false,
            updatedAtMs: now,
          })
          .run();
        imported.settings = 1;
      }
    }

    const report: LocalDataImportReport = {
      decision: "imported",
      imported,
      skipped: skippedRecords,
      completedAt: new Date(now).toISOString(),
    };
    // This is intentionally the final write: a thrown mutation rolls everything
    // back and leaves the idempotency token available for a corrected retry.
    storeReport(transactionalDb, userId, idempotencyToken, report, now);
    return { kind: "ok", report, replayed: false };
  });
}

export function skipLocalDataImport(
  db: Db,
  userId: string,
  idempotencyToken: string,
  now = Date.now(),
): LocalDataImportResult {
  const decided = existingDecision(db, userId, idempotencyToken);
  if (decided !== null) return decided;

  return db.transaction((tx) => {
    const transactionalDb = tx as Db;
    const racedDecision = existingDecision(transactionalDb, userId, idempotencyToken);
    if (racedDecision !== null) return racedDecision;
    const report: LocalDataImportReport = {
      decision: "skipped",
      imported: emptyCounts(),
      skipped: [],
      completedAt: new Date(now).toISOString(),
    };
    storeReport(transactionalDb, userId, idempotencyToken, report, now);
    return { kind: "ok", report, replayed: false };
  });
}
