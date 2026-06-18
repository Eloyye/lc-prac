import { create } from "zustand";
import type { Problem, Solution } from "@shared/types";
import { listProblems } from "../api/problems";
import {
  clearOverride,
  deleteCustomProblem,
  hideBundledProblem,
  mergedLibrary,
  saveCustomProblem,
  saveOverride,
} from "../persistence/storage";

export type LibraryStatus = "idle" | "loading" | "ready" | "error";

interface LibraryState {
  /** The effective Library: API bundled Problems with local edits, plus customs. */
  problems: Problem[];
  /**
   * The pristine bundled set fetched from the API, kept as the merge source so
   * local edits/deletes can re-derive `problems` without another request.
   */
  bundled: Problem[];
  status: LibraryStatus;
  /** A human-readable message when `status === "error"`, else null. */
  error: string | null;
  /** Fetch the bundled Library from the API and (re)merge local personalization. */
  load: () => Promise<void>;
  /** Resolve once the Library is loaded, kicking off a load if needed. */
  ensureLoaded: () => Promise<void>;
  /** Create or update a Problem — a bundled id writes an override, else a custom. */
  saveProblem: (problem: Problem) => void;
  /** Delete a Problem — a bundled id is tombstoned, else the custom is removed. */
  deleteProblem: (id: string) => void;
  /** Revert an edited bundled Problem to its shipped version; a no-op otherwise. */
  resetProblem: (id: string) => void;
}

// An id present in the API-sourced bundled set routes edits/deletes to the
// override/tombstone layer; any other id is treated as a custom Problem.
function isBundledId(bundled: Problem[], id: string): boolean {
  return bundled.some((problem) => problem.id === id);
}

// Re-derive the effective Library from the fetched bundled set plus the local
// override/tombstone/custom layers, which remain browser-local until accounts
// move them server-side in a later phase.
function remerge(bundled: Problem[]): Problem[] {
  return mergedLibrary(bundled);
}

// Shared in-flight load so concurrent callers (route loaders, the shell effect)
// trigger exactly one request. Cleared when settled so a failed load can retry.
let loadPromise: Promise<void> | null = null;

export const useLibrary = create<LibraryState>((set, get) => ({
  problems: [],
  bundled: [],
  status: "idle",
  error: null,

  load: async () => {
    set({ status: "loading", error: null });
    try {
      const { problems: bundled } = await listProblems();
      set({ bundled, problems: remerge(bundled), status: "ready", error: null });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Failed to load the library.";
      set({ status: "error", error: message });
      throw cause;
    }
  },

  ensureLoaded: () => {
    const { status, load } = get();
    if (status === "ready") return Promise.resolve();
    if (loadPromise === null) {
      // Swallow the rejection here (callers observe failure via `status`/`error`);
      // a thrown load would otherwise become an unhandled rejection on the shell.
      loadPromise = load()
        .catch(() => {})
        .finally(() => {
          loadPromise = null;
        });
    }
    return loadPromise;
  },

  saveProblem: (problem) => {
    const { bundled } = get();
    if (isBundledId(bundled, problem.id)) {
      saveOverride(problem);
    } else {
      saveCustomProblem(problem);
    }
    set({ problems: remerge(bundled) });
  },
  deleteProblem: (id) => {
    const { bundled } = get();
    if (isBundledId(bundled, id)) {
      hideBundledProblem(id);
    } else {
      deleteCustomProblem(id);
    }
    set({ problems: remerge(bundled) });
  },
  resetProblem: (id) => {
    const { bundled } = get();
    if (!isBundledId(bundled, id)) return;
    clearOverride(id);
    set({ problems: remerge(bundled) });
  },
}));

/**
 * Route-loader helper: await Library hydration, then resolve the requested
 * Problem. Returns null only when the Problem genuinely is not in the loaded
 * Library, so a direct navigation or refresh waits for the async load instead of
 * transiently resolving not-found before data arrives.
 */
export async function resolveProblem(problemId: string): Promise<Problem | null> {
  await useLibrary.getState().ensureLoaded();
  return useLibrary.getState().problems.find((problem) => problem.id === problemId) ?? null;
}

/** Route-loader helper: await hydration, then resolve a Problem + one Solution. */
export async function resolveSession(
  problemId: string,
  solutionId: string,
): Promise<{ problem: Problem; solution: Solution } | null> {
  await useLibrary.getState().ensureLoaded();
  const problem = useLibrary.getState().problems.find((p) => p.id === problemId);
  const solution = problem?.solutions.find((s) => s.id === solutionId);
  if (problem === undefined || solution === undefined) return null;
  return { problem, solution };
}
