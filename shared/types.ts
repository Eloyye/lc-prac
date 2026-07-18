export type Lang = "python";
export type Mode = "copy" | "recall" | "free";

export interface Solution {
  id: string;
  lang: Lang;
  approach: string;
  code: string;
  timeComplexity?: string;
  spaceComplexity?: string;
}

/**
 * A worked input → output sample for a Problem. Kept structured (discrete
 * `input`/`output` rather than one prose blob) so a future Free/Solve runner can
 * feed `input` to the user's code and assert against `output`; display is the v1
 * surface.
 */
export interface Example {
  input: string;
  output: string;
  explanation?: string;
}

export interface Problem {
  id: string;
  title: string;
  difficulty: "easy" | "medium" | "hard";
  tags: string[];
  url?: string;
  origin: "bundled" | "custom";
  // The fields below are optional content surfaces. They target custom / own /
  // openly-licensed Problems — bundled LeetCode Problems leave them unset and
  // keep linking out via `url` (see PRD §12 licensing), so every consumer must
  // degrade gracefully when they are absent.
  statement?: string; // the description, rendered as markdown
  // Problem-level *target* bounds the solver should aim for ("solve this in
  // O(log n)") — distinct from a Solution's *measured* timeComplexity/
  // spaceComplexity, which is what a given Approach actually achieves.
  expectedTime?: string;
  expectedSpace?: string;
  examples?: Example[];
  solutions: Solution[];
}

export interface Attempt {
  id: string;
  problemId: string;
  solutionId: string;
  /** Immutable display snapshots supplied by the server for durable history. */
  problemTitle?: string;
  solutionApproach?: string;
  mode: Mode;
  cpm: number;
  wpm: number;
  accuracyPct: number;
  durationMs: number;
  /** Optional on legacy local Attempts; always present on server Attempts. */
  totalKeystrokes?: number;
  errorKeystrokes?: number;
  correctChars?: number;
  errorMap?: unknown;
  createdAt: string;
}

export interface BestScore {
  problemId: string;
  solutionId: string;
  mode: Mode;
  bestCpm: number;
  bestAccuracyPct?: number;
  bestDurationMs?: number;
  attemptId?: string;
  updatedAt?: string;
}

/** Fully populated server representation of an immutable completed Session. */
export interface SavedAttempt extends Attempt {
  problemTitle: string;
  solutionApproach: string;
  totalKeystrokes: number;
  errorKeystrokes: number;
  correctChars: number;
}

/** Fully populated server representation of a Mode-specific Personal Best. */
export interface SavedBestScore extends BestScore {
  bestAccuracyPct: number;
  bestDurationMs: number;
  attemptId: string;
  updatedAt: string;
}

export interface CreateAttemptResponse {
  attempt: SavedAttempt;
  bestScore: SavedBestScore;
  isPersonalBest: boolean;
}

/** Optional ownership-scoped filters shared by history and aggregate reads. */
export interface HistoryFilters {
  problemId?: string;
  solutionId?: string;
  mode?: Mode;
}

export interface AttemptListResponse {
  attempts: SavedAttempt[];
}

export interface BestScoreListResponse {
  bestScores: SavedBestScore[];
}

/** Account-backed aggregate state for the current Stats page and dashboard. */
export interface StatsSummary extends HistoryFilters {
  totalAttempts: number;
  practicedProblemCount: number;
  averageCpm: number;
  averageAccuracyPct: number;
  bestCpm: number;
  totalPracticeTimeMs: number;
  recentAttempts: SavedAttempt[];
}

export interface Settings {
  mode: Mode;
  distractionFree: boolean;
}

/** Account-backed Settings plus server-owned synchronization metadata. */
export interface SavedSettings extends Settings {
  updatedAt: string;
}

export interface SettingsResponse {
  settings: SavedSettings;
}

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
