import type { Problem } from "@shared/types";
import { apiGet, apiRequest } from "./client";

export type ProblemPersonalization = {
  overriddenProblemIds: string[];
  hiddenProblems: Problem[];
};

export type ProblemListResponse = {
  problems: Problem[];
  nextCursor: string | null;
  personalization?: ProblemPersonalization | null;
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

/** Upsert the signed-in caller's full bundled-Problem Override. */
export function updateBundledProblem(id: string, problem: Problem): Promise<{ problem: Problem }> {
  return apiRequest(`/problems/${encodeURIComponent(id)}`, { method: "PATCH", body: problem });
}

/** Create the signed-in caller's Tombstone without removing an Override. */
export function hideBundledProblem(id: string): Promise<{ ok: true }> {
  return apiRequest(`/problems/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/** Remove only the signed-in caller's Tombstone. */
export function restoreBundledProblem(id: string): Promise<{ ok: true }> {
  return apiRequest(`/problems/${encodeURIComponent(id)}/restore`, { method: "POST" });
}

/** Remove only the signed-in caller's Override. */
export function resetBundledProblem(id: string): Promise<{ ok: true }> {
  return apiRequest(`/problems/${encodeURIComponent(id)}/reset`, { method: "POST" });
}
