import type { Mode } from "../domain/mode";

/** Optional ownership-scoped filters shared by history and aggregate reads. */
export interface HistoryFilters {
  problemId?: string;
  solutionId?: string;
  mode?: Mode;
}
