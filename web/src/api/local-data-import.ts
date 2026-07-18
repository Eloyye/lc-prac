import type {
  LocalDataImportRequest,
  LocalDataImportResponse,
  LocalDataImportStatusResponse,
  LocalDataSkipRequest,
} from "@shared/types";
import { apiGet, apiJson } from "./client";

export function getLocalDataImportStatus(): Promise<LocalDataImportStatusResponse> {
  return apiGet<LocalDataImportStatusResponse>("/local-data-import");
}

export function importLocalData(request: LocalDataImportRequest): Promise<LocalDataImportResponse> {
  return apiJson<LocalDataImportResponse>("POST", "/local-data-import", request);
}

export function skipLocalDataImport(
  request: LocalDataSkipRequest,
): Promise<LocalDataImportResponse> {
  return apiJson<LocalDataImportResponse>("POST", "/local-data-import", request);
}
