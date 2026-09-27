import type { Attempt } from "../domain/attempt";
import type { Mode } from "../domain/mode";
import type { Problem } from "../domain/problem";
import type { Settings } from "../domain/settings";
import { array, boolean, literal, number, object, string } from "./decode";
import type { Decoder } from "./decode";

/** Browser-local collections supported by the one-time account Import. */
export type LocalDataCollection =
  | "customProblems"
  | "overrides"
  | "tombstones"
  | "attempts"
  | "settings";

export type LocalDataImportCounts = Record<LocalDataCollection, number>;

export interface LocalDataImportSkippedRecord {
  collection: LocalDataCollection;
  /** Logical record id, or a stable array position when malformed data has no id. */
  id: string;
  reason: "conflict" | "invalid" | "unavailable";
}

/** One immutable result returned for both the first submission and token replays. */
export interface LocalDataImportReport {
  decision: "imported" | "skipped";
  imported: LocalDataImportCounts;
  skipped: LocalDataImportSkippedRecord[];
  completedAt: string;
}

export type LocalDataImportStatusResponse =
  | { status: "pending" }
  | { status: "complete"; report: LocalDataImportReport };

/** Legacy local Attempts may predate Mode and detailed keystroke counters. */
export type LocalAttemptImport = Omit<Attempt, "mode"> & { mode?: Mode };

/** Only today's synchronized Settings are eligible; legacy keys are omitted. */
export type LocalSettingsImport = Partial<Settings>;

export interface LocalDataImportRequest {
  action: "import";
  idempotencyToken: string;
  customProblems: Problem[];
  overrides: Problem[];
  tombstones: string[];
  attempts: LocalAttemptImport[];
  settings?: LocalSettingsImport;
}

export interface LocalDataSkipRequest {
  action: "skip";
  idempotencyToken: string;
}

export interface LocalDataImportResponse {
  report: LocalDataImportReport;
  replayed: boolean;
}

const decodeCollection = literal<LocalDataCollection>(
  "customProblems",
  "overrides",
  "tombstones",
  "attempts",
  "settings",
);

const decodeReport: Decoder<LocalDataImportReport> = object({
  decision: literal("imported", "skipped"),
  imported: object({
    customProblems: number,
    overrides: number,
    tombstones: number,
    attempts: number,
    settings: number,
  }),
  skipped: array(
    object({
      collection: decodeCollection,
      id: string,
      reason: literal("conflict", "invalid", "unavailable"),
    }),
  ),
  completedAt: string,
});

export const decodeLocalDataImportStatusResponse: Decoder<LocalDataImportStatusResponse> = (
  value,
  path = "",
) => {
  const { status } = object({ status: literal("pending", "complete") })(value, path);
  return status === "pending"
    ? (value as LocalDataImportStatusResponse)
    : object({ status: literal("complete"), report: decodeReport })(value, path);
};

export const decodeLocalDataImportResponse: Decoder<LocalDataImportResponse> = object({
  report: decodeReport,
  replayed: boolean,
});
