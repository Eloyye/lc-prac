import type { SavedAttempt, SavedBestScore } from "../domain/attempt";
import { isMode } from "../domain/mode";
import type { Mode } from "../domain/mode";
import { array, boolean, guarded, number, object, string, unknownValue } from "./decode";
import type { Decoder } from "./decode";
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

const decodeMode = guarded(isMode, "a Mode");

export const decodeSavedAttempt: Decoder<SavedAttempt> = object(
  {
    id: string,
    problemId: string,
    solutionId: string,
    problemTitle: string,
    solutionApproach: string,
    mode: decodeMode,
    cpm: number,
    wpm: number,
    accuracyPct: number,
    durationMs: number,
    totalKeystrokes: number,
    errorKeystrokes: number,
    correctChars: number,
    createdAt: string,
  },
  { errorMap: unknownValue },
);

export const decodeSavedBestScore: Decoder<SavedBestScore> = object({
  problemId: string,
  solutionId: string,
  mode: decodeMode,
  bestCpm: number,
  bestAccuracyPct: number,
  bestDurationMs: number,
  attemptId: string,
  updatedAt: string,
});

export const decodeCreateAttemptResponse: Decoder<CreateAttemptResponse> = object({
  attempt: decodeSavedAttempt,
  bestScore: decodeSavedBestScore,
  isPersonalBest: boolean,
});

export const decodeAttemptListResponse: Decoder<AttemptListResponse> = object({
  attempts: array(decodeSavedAttempt),
});
