import type { Mode } from "./mode";

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
