import type { Attempt, BestScore, Mode, Problem, Settings } from "@shared/types";

const SCHEMA_VERSION = 2;
const KEY_VERSION = "ct:v";
const KEY_ATTEMPTS = "ct:attempts";
const KEY_BEST = "ct:best";
const KEY_CUSTOM = "ct:problems:custom";
const KEY_SETTINGS = "ct:settings";
// Edits to a *bundled* Problem are stored as a full-Problem override keyed by id
// (it lives in source, so we shadow it rather than mutate it); deletions of a
// bundled Problem are tombstones — its id in a hidden list. Custom Problems need
// neither: they live entirely in KEY_CUSTOM and are edited/removed there.
const KEY_OVERRIDES = "ct:problems:overrides";
const KEY_HIDDEN = "ct:problems:hidden";

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
  // Scores written before Mode selection existed belong to Copy mode.
  return read<Array<BestScore | Omit<BestScore, "mode">>>(KEY_BEST, []).map((score) => ({
    ...score,
    mode: "mode" in score ? score.mode : "copy",
  }));
}

export function bestFor(
  problemId: string,
  solutionId: string,
  mode: Mode = "copy",
): BestScore | undefined {
  return loadBestScores().find(
    (b) => b.problemId === problemId && b.solutionId === solutionId && b.mode === mode,
  );
}

function updateBest(attempt: Attempt): void {
  const scores = loadBestScores();
  const existing = scores.find(
    (b) =>
      b.problemId === attempt.problemId &&
      b.solutionId === attempt.solutionId &&
      b.mode === attempt.mode,
  );
  if (existing === undefined) {
    scores.push({
      problemId: attempt.problemId,
      solutionId: attempt.solutionId,
      mode: attempt.mode,
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

const DEFAULT_SETTINGS: Settings = { mode: "copy", distractionFree: false };

export function loadSettings(): Settings {
  return { ...DEFAULT_SETTINGS, ...read<Partial<Settings>>(KEY_SETTINGS, {}) };
}

export function saveSettings(settings: Settings): void {
  write(KEY_SETTINGS, settings);
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

/**
 * Drop the Attempts and Personal Bests a Problem owned so they can't dangle
 * forever — or be silently inherited by a later Problem that reuses this id.
 * Shared by custom deletion and bundled hiding; both destroy the same history.
 */
function purgeProblemHistory(id: string): void {
  write(
    KEY_ATTEMPTS,
    loadAttempts().filter((a) => a.problemId !== id),
  );
  write(
    KEY_BEST,
    loadBestScores().filter((b) => b.problemId !== id),
  );
}

export function deleteCustomProblem(id: string): void {
  write(
    KEY_CUSTOM,
    loadCustomProblems().filter((p) => p.id !== id),
  );
  // Deleting the Problem deletes its history too.
  purgeProblemHistory(id);
}

export function loadOverrides(): Record<string, Problem> {
  return read<Record<string, Problem>>(KEY_OVERRIDES, {});
}

/** Upsert a bundled Problem's override — the user-edited copy that shadows it. */
export function saveOverride(problem: Problem): void {
  const overrides = loadOverrides();
  overrides[problem.id] = problem;
  write(KEY_OVERRIDES, overrides);
}

/** Drop a bundled Problem's override, reverting it to the shipped version. */
export function clearOverride(id: string): void {
  const overrides = loadOverrides();
  delete overrides[id];
  write(KEY_OVERRIDES, overrides);
}

/** Whether a bundled Problem is currently shadowed by a user edit (gates "Reset"). */
export function hasOverride(id: string): boolean {
  return Object.hasOwn(loadOverrides(), id);
}

export function loadHidden(): string[] {
  return read<string[]>(KEY_HIDDEN, []);
}

/**
 * Tombstone a bundled Problem so the merged Library hides it. We also drop any
 * override (a hidden Problem has no visible copy to edit) and purge its history,
 * mirroring how deleting a custom Problem clears everything it owned.
 */
export function hideBundledProblem(id: string): void {
  const hidden = loadHidden();
  if (!hidden.includes(id)) {
    hidden.push(id);
    write(KEY_HIDDEN, hidden);
  }
  clearOverride(id);
  purgeProblemHistory(id);
}

/**
 * The merged Library: the given bundled Problems with overrides applied and
 * tombstoned ones removed, followed by the user's custom Problems. Pure over the
 * `bundled` arg (the store passes PROBLEMS) so the merge is unit-testable without
 * the bundled content. Custom ids never collide with bundled ones (random UUIDs).
 */
export function mergedLibrary(bundled: Problem[]): Problem[] {
  const overrides = loadOverrides();
  const hidden = new Set(loadHidden());
  const visibleBundled = bundled.filter((p) => !hidden.has(p.id)).map((p) => overrides[p.id] ?? p);
  return [...visibleBundled, ...loadCustomProblems()];
}
