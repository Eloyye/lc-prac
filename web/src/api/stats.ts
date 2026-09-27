import type { HistoryFilters } from "@shared/api/history";
import { decodeBestScoreListResponse, decodeStatsSummary } from "@shared/api/stats";
import type { BestScoreListResponse, StatsSummary } from "@shared/api/stats";
import { apiGet } from "./client";

export function listBestScores(filters?: HistoryFilters): Promise<BestScoreListResponse> {
  return apiGet(
    "/stats/best-scores",
    decodeBestScoreListResponse,
    filters === undefined ? undefined : { ...filters },
  );
}

export function getStatsSummary(filters?: HistoryFilters): Promise<StatsSummary> {
  return apiGet(
    "/stats/summary",
    decodeStatsSummary,
    filters === undefined ? undefined : { ...filters },
  );
}
