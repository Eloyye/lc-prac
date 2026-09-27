import type {
  AttemptListQuery,
  AttemptListResponse,
  CreateAttemptRequest,
  CreateAttemptResponse,
} from "@shared/api/attempts";
import { apiGet, apiJson } from "./client";

/** Persist one completed Session and receive the authoritative PB state. */
export function createAttempt(input: CreateAttemptRequest): Promise<CreateAttemptResponse> {
  return apiJson<CreateAttemptResponse>("POST", "/attempts", input);
}

/** Read the signed-in user's durable Attempt snapshots, newest first. */
export function listAttempts(params?: AttemptListQuery): Promise<AttemptListResponse> {
  return apiGet<AttemptListResponse>("/attempts", params === undefined ? undefined : { ...params });
}
