import type {
  AttemptListResponse,
  CreateAttemptResponse,
  HistoryFilters,
  Mode,
} from "@shared/types";
import { apiGet, apiJson } from "./client";

export type CreateAttemptInput = {
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
  createdAt: string;
};

/** Persist one completed Session and receive the authoritative PB state. */
export function createAttempt(input: CreateAttemptInput): Promise<CreateAttemptResponse> {
  return apiJson<CreateAttemptResponse>("POST", "/attempts", input);
}

export type AttemptListParams = HistoryFilters & { limit?: number };

/** Read the signed-in user's durable Attempt snapshots, newest first. */
export function listAttempts(params?: AttemptListParams): Promise<AttemptListResponse> {
  return apiGet<AttemptListResponse>("/attempts", params === undefined ? undefined : { ...params });
}
