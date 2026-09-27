/**
 * Transitional compatibility barrel (issue #47). Domain entities live in
 * `shared/domain/*` and endpoint wire contracts in `shared/api/*`; import from
 * those directly. This file is removed once every caller has migrated.
 */
export type { Mode } from "./domain/mode";
export type { Example, Lang, Problem, Solution } from "./domain/problem";
export type { Attempt, BestScore, SavedAttempt, SavedBestScore } from "./domain/attempt";
export type { SavedSettings, Settings } from "./domain/settings";
export type { HistoryFilters } from "./api/history";
export type { AttemptListResponse, CreateAttemptResponse } from "./api/attempts";
export type { BestScoreListResponse, StatsSummary } from "./api/stats";
export type { SettingsResponse } from "./api/settings";
export type {
  LocalAttemptImport,
  LocalDataCollection,
  LocalDataImportCounts,
  LocalDataImportReport,
  LocalDataImportRequest,
  LocalDataImportResponse,
  LocalDataImportSkippedRecord,
  LocalDataImportStatusResponse,
  LocalDataSkipRequest,
  LocalSettingsImport,
} from "./api/local-data-import";
