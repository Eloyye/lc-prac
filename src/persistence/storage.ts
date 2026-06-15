import type { Attempt, BestScore } from "../types";

const SCHEMA_VERSION = 1;
const KEY_VERSION = "ct:v";
const KEY_ATTEMPTS = "ct:attempts";
const KEY_BEST = "ct:best";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable or over quota — ignore in v1.
  }
}

export function initStorage(): void {
  write(KEY_VERSION, SCHEMA_VERSION);
}

export function loadAttempts(): Attempt[] {
  return read<Attempt[]>(KEY_ATTEMPTS, []);
}

function loadBestScores(): BestScore[] {
  return read<BestScore[]>(KEY_BEST, []);
}

export function bestFor(problemId: string, solutionId: string): BestScore | undefined {
  return loadBestScores().find((b) => b.problemId === problemId && b.solutionId === solutionId);
}

function updateBest(attempt: Attempt): void {
  const scores = loadBestScores();
  const existing = scores.find(
    (b) => b.problemId === attempt.problemId && b.solutionId === attempt.solutionId,
  );
  if (existing === undefined) {
    scores.push({
      problemId: attempt.problemId,
      solutionId: attempt.solutionId,
      bestCpm: attempt.cpm,
    });
  } else if (attempt.cpm > existing.bestCpm) {
    existing.bestCpm = attempt.cpm;
  }
  write(KEY_BEST, scores);
}

export function saveAttempt(attempt: Attempt): void {
  const attempts = loadAttempts();
  attempts.push(attempt);
  write(KEY_ATTEMPTS, attempts);
  updateBest(attempt);
}
