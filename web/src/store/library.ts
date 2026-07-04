import { create } from "zustand";
import type { Problem, Solution } from "@shared/types";
import {
  archiveProblem,
  createProblem,
  listProblems,
  permanentlyDeleteProblem as permanentlyDeleteProblemRequest,
  restoreProblem as restoreProblemRequest,
  updateProblem,
} from "../api/problems";
import {
  clearOverride,
  hideBundledProblem,
  mergedLibrary,
  saveOverride,
} from "../persistence/storage";

export type LibraryStatus = "idle" | "loading" | "ready" | "error";

interface LibraryState {
  /** Effective active Library: personalized bundled Problems plus server customs. */
  problems: Problem[];
  bundled: Problem[];
  custom: Problem[];
  /** Owned custom Problems outside the active Library. */
  archived: Problem[];
  status: LibraryStatus;
  error: string | null;
  actionError: string | null;
  load: () => Promise<void>;
  ensureLoaded: () => Promise<void>;
  /** Create/update custom Problems remotely; bundled edits remain local until #25. */
  saveProblem: (problem: Problem) => Promise<void>;
  /** Archive a custom Problem; bundled Problems keep the current local hide path. */
  deleteProblem: (id: string) => Promise<void>;
  restoreProblem: (id: string) => Promise<void>;
  permanentlyDeleteProblem: (id: string) => Promise<void>;
  resetProblem: (id: string) => void;
  clearActionError: () => void;
}

function isBundledId(bundled: Problem[], id: string): boolean {
  return bundled.some((problem) => problem.id === id);
}

function effectiveProblems(bundled: Problem[], custom: Problem[]): Problem[] {
  // `mergedLibrary` still owns the bundled Override/Tombstone behavior. Discard
  // its legacy local-custom tail: authenticated custom state now comes from API.
  const personalizedBundled = mergedLibrary(bundled).filter(
    (problem) => problem.origin === "bundled",
  );
  return [...personalizedBundled, ...custom];
}

function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : "The Problem change failed.";
}

let loadPromise: Promise<void> | null = null;

export const useLibrary = create<LibraryState>((set, get) => ({
  problems: [],
  bundled: [],
  custom: [],
  archived: [],
  status: "idle",
  error: null,
  actionError: null,

  load: async () => {
    set({ status: "loading", error: null, actionError: null });
    try {
      const [activeResult, archivedResult] = await Promise.all([
        listProblems({ status: "active" }),
        listProblems({ status: "archived", origin: "custom" }),
      ]);
      const bundled = activeResult.problems.filter((problem) => problem.origin === "bundled");
      const custom = activeResult.problems.filter((problem) => problem.origin === "custom");
      set({
        bundled,
        custom,
        archived: archivedResult.problems,
        problems: effectiveProblems(bundled, custom),
        status: "ready",
        error: null,
      });
    } catch (cause) {
      const error = message(cause);
      set({ status: "error", error });
      throw cause;
    }
  },

  ensureLoaded: () => {
    const { status, load } = get();
    if (status === "ready") return Promise.resolve();
    if (loadPromise === null) {
      loadPromise = load()
        .catch(() => {})
        .finally(() => {
          loadPromise = null;
        });
    }
    return loadPromise;
  },

  saveProblem: async (problem) => {
    const { bundled, custom } = get();
    set({ actionError: null });
    if (isBundledId(bundled, problem.id)) {
      saveOverride(problem);
      set({ problems: effectiveProblems(bundled, custom) });
      return;
    }
    try {
      const existing = custom.some((candidate) => candidate.id === problem.id);
      const saved = existing ? await updateProblem(problem) : await createProblem(problem);
      const nextCustom = existing
        ? custom.map((candidate) => (candidate.id === saved.id ? saved : candidate))
        : [...custom, saved];
      set({ custom: nextCustom, problems: effectiveProblems(bundled, nextCustom) });
    } catch (cause) {
      set({ actionError: message(cause) });
      throw cause;
    }
  },

  deleteProblem: async (id) => {
    const { bundled, custom, archived } = get();
    set({ actionError: null });
    if (isBundledId(bundled, id)) {
      hideBundledProblem(id);
      set({ problems: effectiveProblems(bundled, custom) });
      return;
    }
    try {
      const archivedProblem = await archiveProblem(id);
      const nextCustom = custom.filter((problem) => problem.id !== id);
      set({
        custom: nextCustom,
        archived: [...archived.filter((problem) => problem.id !== id), archivedProblem],
        problems: effectiveProblems(bundled, nextCustom),
      });
    } catch (cause) {
      set({ actionError: message(cause) });
      throw cause;
    }
  },

  restoreProblem: async (id) => {
    const { bundled, custom, archived } = get();
    set({ actionError: null });
    try {
      const restored = await restoreProblemRequest(id);
      const nextCustom = [...custom.filter((problem) => problem.id !== id), restored];
      set({
        custom: nextCustom,
        archived: archived.filter((problem) => problem.id !== id),
        problems: effectiveProblems(bundled, nextCustom),
      });
    } catch (cause) {
      set({ actionError: message(cause) });
      throw cause;
    }
  },

  permanentlyDeleteProblem: async (id) => {
    set({ actionError: null });
    try {
      await permanentlyDeleteProblemRequest(id);
      set((state) => ({ archived: state.archived.filter((problem) => problem.id !== id) }));
    } catch (cause) {
      set({ actionError: message(cause) });
      throw cause;
    }
  },

  resetProblem: (id) => {
    const { bundled, custom } = get();
    if (!isBundledId(bundled, id)) return;
    clearOverride(id);
    set({ problems: effectiveProblems(bundled, custom) });
  },

  clearActionError: () => set({ actionError: null }),
}));

export async function resolveProblem(problemId: string): Promise<Problem | null> {
  await useLibrary.getState().ensureLoaded();
  return useLibrary.getState().problems.find((problem) => problem.id === problemId) ?? null;
}

export async function resolveSession(
  problemId: string,
  solutionId: string,
): Promise<{ problem: Problem; solution: Solution } | null> {
  await useLibrary.getState().ensureLoaded();
  const problem = useLibrary.getState().problems.find((candidate) => candidate.id === problemId);
  const solution = problem?.solutions.find((candidate) => candidate.id === solutionId);
  if (problem === undefined || solution === undefined) return null;
  return { problem, solution };
}
