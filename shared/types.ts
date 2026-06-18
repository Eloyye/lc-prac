export type Lang = "python";
export type Mode = "copy" | "recall" | "free";

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
  difficulty: "easy" | "medium" | "hard";
  tags: string[];
  url?: string;
  origin: "bundled" | "custom";
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

export interface Attempt {
  id: string;
  problemId: string;
  solutionId: string;
  mode: Mode;
  cpm: number;
  wpm: number;
  accuracyPct: number;
  durationMs: number;
  createdAt: string;
}

export interface BestScore {
  problemId: string;
  solutionId: string;
  mode: Mode;
  bestCpm: number;
}

export interface Settings {
  mode: Mode;
  distractionFree: boolean;
}
