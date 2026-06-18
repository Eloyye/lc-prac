import type { Attempt, BestScore, Problem } from "../types";

const SCHEMA_VERSION = 1;
const KEY_VERSION = "ct:v";
const KEY_ATTEMPTS = "ct:attempts";
const KEY_BEST = "ct:best";
const KEY_CUSTOM = "ct:problems:custom";

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

/**
 * A Problem's Attempts across all its Solutions, most recent first and capped at
 * `limit`. Backs the Problem detail page's recent-activity list; createdAt is an
 * ISO timestamp, so a lexicographic compare orders chronologically.
 */
export function recentAttemptsForProblem(problemId: string, limit = 5): Attempt[] {
  return loadAttempts()
    .filter((a) => a.problemId === problemId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
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

export function loadCustomProblems(): Problem[] {
  return read<Problem[]>(KEY_CUSTOM, []);
}

export function saveCustomProblem(problem: Problem): void {
  const list = loadCustomProblems();
  const index = list.findIndex((p) => p.id === problem.id);
  if (index >= 0) {
    list[index] = problem;
  } else {
    list.push(problem);
  }
  write(KEY_CUSTOM, list);
}

export function deleteCustomProblem(id: string): void {
  write(
    KEY_CUSTOM,
    loadCustomProblems().filter((p) => p.id !== id),
  );
  // Deleting the Problem deletes its history too: purge the Attempts and
  // Personal Bests it owned so they can't dangle forever — or be silently
  // inherited by a later import that reuses this id.
  write(
    KEY_ATTEMPTS,
    loadAttempts().filter((a) => a.problemId !== id),
  );
  write(
    KEY_BEST,
    loadBestScores().filter((b) => b.problemId !== id),
  );
}
