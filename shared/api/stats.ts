import type { SavedAttempt, SavedBestScore } from "../domain/attempt";
import { isMode } from "../domain/mode";
import { decodeSavedAttempt, decodeSavedBestScore } from "./attempts";
import { array, guarded, number, object, string } from "./decode";
import type { Decoder } from "./decode";
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

export const decodeBestScoreListResponse: Decoder<BestScoreListResponse> = object({
  bestScores: array(decodeSavedBestScore),
});

export const decodeStatsSummary: Decoder<StatsSummary> = object(
  {
    totalAttempts: number,
    practicedProblemCount: number,
    averageCpm: number,
    averageAccuracyPct: number,
    bestCpm: number,
    totalPracticeTimeMs: number,
    recentAttempts: array(decodeSavedAttempt),
  },
  { problemId: string, solutionId: string, mode: guarded(isMode, "a Mode") },
);
