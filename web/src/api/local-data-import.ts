import {
  decodeLocalDataImportResponse,
  decodeLocalDataImportStatusResponse,
} from "@shared/api/local-data-import";
import type {
  LocalDataImportRequest,
  LocalDataImportResponse,
  LocalDataImportStatusResponse,
  LocalDataSkipRequest,
} from "@shared/api/local-data-import";
import { apiGet, apiJson } from "./client";

export function getLocalDataImportStatus(): Promise<LocalDataImportStatusResponse> {
  return apiGet("/local-data-import", decodeLocalDataImportStatusResponse);
}

export function importLocalData(request: LocalDataImportRequest): Promise<LocalDataImportResponse> {
  return apiJson("POST", "/local-data-import", decodeLocalDataImportResponse, request);
}

export function skipLocalDataImport(
  request: LocalDataSkipRequest,
): Promise<LocalDataImportResponse> {
  return apiJson("POST", "/local-data-import", decodeLocalDataImportResponse, request);
}
