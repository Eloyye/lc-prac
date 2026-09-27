import type {
  ProblemAckResponse,
  ProblemListQuery,
  ProblemListResponse,
} from "@shared/api/problems";
import type { Problem } from "@shared/domain/problem";
import { apiGet, apiJson } from "./client";

/** The caller's effective Library list. Anonymous callers get bundled Problems. */
export function listProblems(params: ProblemListQuery = {}): Promise<ProblemListResponse> {
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
export function hideBundledProblem(id: string): Promise<ProblemAckResponse> {
  return apiJson<ProblemAckResponse>("DELETE", `/problems/${encodeURIComponent(id)}`);
}

/** Return an archived custom Problem to the active Library. */
export function restoreProblem(id: string): Promise<Problem> {
  return apiJson<Problem>("POST", `/problems/${encodeURIComponent(id)}/restore`);
}

/** Remove only the signed-in caller's Tombstone. */
export function restoreBundledProblem(id: string): Promise<ProblemAckResponse> {
  return apiJson<ProblemAckResponse>("POST", `/problems/${encodeURIComponent(id)}/restore`);
}

/** Remove only the signed-in caller's Override. */
export function resetBundledProblem(id: string): Promise<ProblemAckResponse> {
  return apiJson<ProblemAckResponse>("POST", `/problems/${encodeURIComponent(id)}/reset`);
}

/** Permanently remove one already-archived custom Problem. */
export function permanentlyDeleteProblem(id: string): Promise<void> {
  return apiJson<void>("DELETE", `/problems/${encodeURIComponent(id)}/permanent`);
}
