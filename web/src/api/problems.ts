import type { Problem } from "@shared/types";
import { apiGet, apiJson } from "./client";

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

/** Create a server-owned custom Problem for the signed-in caller. */
export function createProblem(problem: Problem): Promise<Problem> {
  return apiJson<Problem>("POST", "/problems", problem);
}

/** Replace the complete editable content of one owned custom Problem. */
export function updateProblem(problem: Problem): Promise<Problem> {
  return apiJson<Problem>("PATCH", `/problems/${encodeURIComponent(problem.id)}`, problem);
}

/** Upsert the signed-in caller's full bundled-Problem Override. */
export function updateBundledProblem(problem: Problem): Promise<Problem> {
  return apiJson<Problem>("PATCH", `/problems/${encodeURIComponent(problem.id)}`, problem);
}

/** Remove an active custom Problem from the Library without changing its identity. */
export function archiveProblem(id: string): Promise<Problem> {
  return apiJson<Problem>("DELETE", `/problems/${encodeURIComponent(id)}`);
}

/** Create the signed-in caller's Tombstone without removing an Override. */
export function hideBundledProblem(id: string): Promise<{ ok: true }> {
  return apiJson<{ ok: true }>("DELETE", `/problems/${encodeURIComponent(id)}`);
}

/** Return an archived custom Problem to the active Library. */
export function restoreProblem(id: string): Promise<Problem> {
  return apiJson<Problem>("POST", `/problems/${encodeURIComponent(id)}/restore`);
}

/** Remove only the signed-in caller's Tombstone. */
export function restoreBundledProblem(id: string): Promise<{ ok: true }> {
  return apiJson<{ ok: true }>("POST", `/problems/${encodeURIComponent(id)}/restore`);
}

/** Remove only the signed-in caller's Override. */
export function resetBundledProblem(id: string): Promise<{ ok: true }> {
  return apiJson<{ ok: true }>("POST", `/problems/${encodeURIComponent(id)}/reset`);
}

/** Permanently remove one already-archived custom Problem. */
export function permanentlyDeleteProblem(id: string): Promise<void> {
  return apiJson<void>("DELETE", `/problems/${encodeURIComponent(id)}/permanent`);
}
