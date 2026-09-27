import { isDifficulty, isOrigin } from "../domain/problem";
import type {
  Difficulty,
  Example,
  Origin,
  Problem,
  ProblemStatus,
  Solution,
} from "../domain/problem";
import { array, guarded, literal, nullable, object, string } from "./decode";
import type { Decoder } from "./decode";

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

const decodeSolution: Decoder<Solution> = object(
  { id: string, lang: literal("python"), approach: string, code: string },
  { timeComplexity: string, spaceComplexity: string },
);

const decodeExample: Decoder<Example> = object(
  { input: string, output: string },
  { explanation: string },
);

export const decodeProblem: Decoder<Problem> = object(
  {
    id: string,
    title: string,
    difficulty: guarded(isDifficulty, "a difficulty"),
    tags: array(string),
    origin: guarded(isOrigin, "an Origin"),
    solutions: array(decodeSolution),
  },
  {
    url: string,
    statement: string,
    expectedTime: string,
    expectedSpace: string,
    examples: array(decodeExample),
  },
);

export const decodeProblemListResponse: Decoder<ProblemListResponse> = object({
  problems: array(decodeProblem),
  nextCursor: nullable(string),
  personalization: nullable(
    object({ overriddenProblemIds: array(string), hiddenProblems: array(decodeProblem) }),
  ),
});

export const decodeProblemAckResponse: Decoder<ProblemAckResponse> = object({
  ok: literal(true),
});
