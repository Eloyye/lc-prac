import { noContent } from "@shared/api/decode";
import {
  decodeProblem,
  decodeProblemAckResponse,
  decodeProblemListResponse,
} from "@shared/api/problems";
import type {
  ProblemAckResponse,
  ProblemListQuery,
  ProblemListResponse,
} from "@shared/api/problems";
import type { Problem } from "@shared/domain/problem";
import { apiGet, apiJson } from "./client";

/** The caller's effective Library list. Anonymous callers get bundled Problems. */
export function listProblems(params: ProblemListQuery = {}): Promise<ProblemListResponse> {
  return apiGet("/problems", decodeProblemListResponse, {
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
  return apiGet(`/problems/${encodeURIComponent(id)}`, decodeProblem);
}

/** Create a server-owned custom Problem for the signed-in caller. */
export function createProblem(problem: Problem): Promise<Problem> {
  return apiJson("POST", "/problems", decodeProblem, problem);
}

/** Replace the complete editable content of one owned custom Problem. */
export function updateProblem(problem: Problem): Promise<Problem> {
  return apiJson("PATCH", `/problems/${encodeURIComponent(problem.id)}`, decodeProblem, problem);
}

/** Upsert the signed-in caller's full bundled-Problem Override. */
export function updateBundledProblem(problem: Problem): Promise<Problem> {
  return apiJson("PATCH", `/problems/${encodeURIComponent(problem.id)}`, decodeProblem, problem);
}

/** Remove an active custom Problem from the Library without changing its identity. */
export function archiveProblem(id: string): Promise<Problem> {
  return apiJson("DELETE", `/problems/${encodeURIComponent(id)}`, decodeProblem);
}

/** Create the signed-in caller's Tombstone without removing an Override. */
export function hideBundledProblem(id: string): Promise<ProblemAckResponse> {
  return apiJson("DELETE", `/problems/${encodeURIComponent(id)}`, decodeProblemAckResponse);
}

/** Return an archived custom Problem to the active Library. */
export function restoreProblem(id: string): Promise<Problem> {
  return apiJson("POST", `/problems/${encodeURIComponent(id)}/restore`, decodeProblem);
}

/** Remove only the signed-in caller's Tombstone. */
export function restoreBundledProblem(id: string): Promise<ProblemAckResponse> {
  return apiJson("POST", `/problems/${encodeURIComponent(id)}/restore`, decodeProblemAckResponse);
}

/** Remove only the signed-in caller's Override. */
export function resetBundledProblem(id: string): Promise<ProblemAckResponse> {
  return apiJson("POST", `/problems/${encodeURIComponent(id)}/reset`, decodeProblemAckResponse);
}

/** Permanently remove one already-archived custom Problem. */
export function permanentlyDeleteProblem(id: string): Promise<void> {
  return apiJson("DELETE", `/problems/${encodeURIComponent(id)}/permanent`, noContent);
}
