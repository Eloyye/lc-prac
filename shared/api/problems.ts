import type { Difficulty, Origin, Problem, ProblemStatus } from "../domain/problem";

/** `GET /problems` query parameters; empty values are treated as absent. */
export interface ProblemListQuery {
  q?: string;
  difficulty?: Difficulty;
  tag?: string;
  origin?: Origin;
  status?: ProblemStatus;
  limit?: number;
  cursor?: string;
}

/** The signed-in caller's bundled-Problem Overrides and Tombstones. */
export interface ProblemPersonalization {
  overriddenProblemIds: string[];
  hiddenProblems: Problem[];
}

export interface ProblemListResponse {
  problems: Problem[];
  nextCursor: string | null;
  /** `null` for anonymous callers and archived listings. */
  personalization: ProblemPersonalization | null;
}

/** Acknowledgement for bundled-Problem hide, restore, and reset. */
export interface ProblemAckResponse {
  ok: true;
}
