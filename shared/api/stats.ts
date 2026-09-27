import type { SavedAttempt, SavedBestScore } from "../domain/attempt";
import type { HistoryFilters } from "./history";

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
