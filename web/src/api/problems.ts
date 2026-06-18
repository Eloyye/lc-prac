import type { Problem } from "@shared/types";
import { apiGet } from "./client";

export type ProblemListResponse = {
  problems: Problem[];
  nextCursor: string | null;
};

export type ProblemListParams = {
  q?: string;
  difficulty?: "easy" | "medium" | "hard";
  tag?: string;
  origin?: "bundled" | "custom";
  status?: "active" | "archived";
  limit?: number;
  cursor?: string;
};

/** The caller's effective Library list. Anonymous callers get bundled Problems. */
export function listProblems(params: ProblemListParams = {}): Promise<ProblemListResponse> {
  return apiGet<ProblemListResponse>("/problems", {
    q: params.q,
    difficulty: params.difficulty,
    tag: params.tag,
    origin: params.origin,
    status: params.status,
    limit: params.limit,
    cursor: params.cursor,
  });
}

/** One effective Problem by id. Rejects with an `ApiError` (status 404) if absent. */
export function getProblem(id: string): Promise<Problem> {
  return apiGet<Problem>(`/problems/${encodeURIComponent(id)}`);
}
