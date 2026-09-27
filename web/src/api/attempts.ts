import type {
  AttemptListQuery,
  AttemptListResponse,
  CreateAttemptRequest,
  CreateAttemptResponse,
} from "@shared/api/attempts";
import { decodeAttemptListResponse, decodeCreateAttemptResponse } from "@shared/api/attempts";
import { apiGet, apiJson } from "./client";

/** Persist one completed Session and receive the authoritative PB state. */
export function createAttempt(input: CreateAttemptRequest): Promise<CreateAttemptResponse> {
  return apiJson("POST", "/attempts", decodeCreateAttemptResponse, input);
}

/** Read the signed-in user's durable Attempt snapshots, newest first. */
export function listAttempts(params?: AttemptListQuery): Promise<AttemptListResponse> {
  return apiGet(
    "/attempts",
    decodeAttemptListResponse,
    params === undefined ? undefined : { ...params },
  );
}
