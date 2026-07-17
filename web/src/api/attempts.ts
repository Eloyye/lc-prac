import type { CreateAttemptResponse, Mode } from "@shared/types";
import { apiJson } from "./client";

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
