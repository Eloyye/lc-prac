import type { SavedAttempt, SavedBestScore } from "../domain/attempt";
import type { Mode } from "../domain/mode";
import type { HistoryFilters } from "./history";

/** `POST /attempts` body: one completed Session, identified by a client id. */
export interface CreateAttemptRequest {
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
  /** ISO timestamp; the server clock is used when omitted. */
  createdAt?: string;
}

/** `GET /attempts` query: history filters plus a page size of 1–100. */
export type AttemptListQuery = HistoryFilters & { limit?: number };

export interface CreateAttemptResponse {
  attempt: SavedAttempt;
  bestScore: SavedBestScore;
  isPersonalBest: boolean;
}

export interface AttemptListResponse {
  attempts: SavedAttempt[];
}
