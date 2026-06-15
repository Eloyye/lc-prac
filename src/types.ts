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

export interface Problem {
  id: string;
  title: string;
  difficulty: "easy" | "medium" | "hard";
  tags: string[];
  url?: string;
  origin: "bundled" | "custom";
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
  bestCpm: number;
}
