export type Lang = "python";

export const DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

/** Whether a Problem ships with the app or was added by the user. */
export const ORIGINS = ["bundled", "custom"] as const;
export type Origin = (typeof ORIGINS)[number];

/** Whether a custom Problem is in the active Library or archived. */
export const PROBLEM_STATUSES = ["active", "archived"] as const;
export type ProblemStatus = (typeof PROBLEM_STATUSES)[number];

function isOneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

export function isDifficulty(value: unknown): value is Difficulty {
  return isOneOf(DIFFICULTIES, value);
}

export function isOrigin(value: unknown): value is Origin {
  return isOneOf(ORIGINS, value);
}

export function isProblemStatus(value: unknown): value is ProblemStatus {
  return isOneOf(PROBLEM_STATUSES, value);
}

export interface Solution {
  id: string;
  lang: Lang;
  approach: string;
  code: string;
  timeComplexity?: string;
  spaceComplexity?: string;
}

/**
 * A worked input → output sample for a Problem. Kept structured (discrete
 * `input`/`output` rather than one prose blob) so a future Free/Solve runner can
 * feed `input` to the user's code and assert against `output`; display is the v1
 * surface.
 */
export interface Example {
  input: string;
  output: string;
  explanation?: string;
}

export interface Problem {
  id: string;
  title: string;
  difficulty: Difficulty;
  tags: string[];
  url?: string;
  origin: Origin;
  // The fields below are optional content surfaces. They target custom / own /
  // openly-licensed Problems — bundled LeetCode Problems leave them unset and
  // keep linking out via `url` (see PRD §12 licensing), so every consumer must
  // degrade gracefully when they are absent.
  statement?: string; // the description, rendered as markdown
  // Problem-level *target* bounds the solver should aim for ("solve this in
  // O(log n)") — distinct from a Solution's *measured* timeComplexity/
  // spaceComplexity, which is what a given Approach actually achieves.
  expectedTime?: string;
  expectedSpace?: string;
  examples?: Example[];
  solutions: Solution[];
}
