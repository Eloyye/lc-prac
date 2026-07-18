import type { BestScoreListResponse, HistoryFilters, StatsSummary } from "@shared/types";
import { apiGet } from "./client";

export function listBestScores(filters?: HistoryFilters): Promise<BestScoreListResponse> {
  return apiGet<BestScoreListResponse>(
    "/stats/best-scores",
    filters === undefined ? undefined : { ...filters },
  );
}

export function getStatsSummary(filters?: HistoryFilters): Promise<StatsSummary> {
  return apiGet<StatsSummary>("/stats/summary", filters === undefined ? undefined : { ...filters });
}
