import type { SavedAttempt, SavedBestScore } from "../domain/attempt";

export interface CreateAttemptResponse {
  attempt: SavedAttempt;
  bestScore: SavedBestScore;
  isPersonalBest: boolean;
}

export interface AttemptListResponse {
  attempts: SavedAttempt[];
}
