import { create } from "zustand";
import type { Problem, Solution } from "@shared/types";
import {
  hideBundledProblem as hideBundledProblemOnServer,
  listProblems,
  resetBundledProblem as resetBundledProblemOnServer,
  restoreBundledProblem as restoreBundledProblemOnServer,
  updateBundledProblem,
} from "../api/problems";
import {
  clearOverride,
  deleteCustomProblem,
  hideBundledProblem,
  loadCustomProblems,
  loadHidden,
  loadOverrides,
  mergedLibrary,
  restoreBundledProblem,
  saveCustomProblem,
  saveOverride,
} from "../persistence/storage";

export type LibraryStatus = "idle" | "loading" | "ready" | "error";

interface LibraryState {
  /** The effective Library for the current anonymous browser or signed-in user. */
  problems: Problem[];
  /** The active bundled response used as the merge source for anonymous local state. */
  bundled: Problem[];
  /** Tombstoned bundled Problems available for Restore. */
  hiddenProblems: Problem[];
  /** Bundled ids currently shadowed by an Override (visible or hidden). */
  overriddenProblemIds: string[];
  authenticated: boolean;
  status: LibraryStatus;
  error: string | null;
  load: () => Promise<void>;
  ensureLoaded: () => Promise<void>;
  saveProblem: (problem: Problem) => Promise<void>;
  deleteProblem: (id: string) => Promise<void>;
  restoreProblem: (id: string) => Promise<void>;
  resetProblem: (id: string) => Promise<void>;
}

type EffectiveState = Pick<
  LibraryState,
  "problems" | "hiddenProblems" | "overriddenProblemIds" | "authenticated"
>;

function localEffectiveState(bundled: Problem[]): EffectiveState {
  const overrides = loadOverrides();
  const hiddenIds = new Set(loadHidden());
  return {
    problems: mergedLibrary(bundled),
    hiddenProblems: bundled
      .filter((problem) => hiddenIds.has(problem.id))
      .map((problem) => overrides[problem.id] ?? problem),
    overriddenProblemIds: Object.keys(overrides),
    authenticated: false,
  };
}

let loadPromise: Promise<void> | null = null;

export const useLibrary = create<LibraryState>((set, get) => ({
  problems: [],
  bundled: [],
  hiddenProblems: [],
  overriddenProblemIds: [],
  authenticated: false,
  status: "idle",
  error: null,

  load: async () => {
    set({ status: "loading", error: null });
    try {
      const response = await listProblems();
      const bundled = response.problems;
      const effective: EffectiveState =
        response.personalization === null || response.personalization === undefined
          ? localEffectiveState(bundled)
          : {
              // Custom Problems remain local until issue #24 moves their ownership.
              problems: [...bundled, ...loadCustomProblems()],
              hiddenProblems: response.personalization.hiddenProblems,
              overriddenProblemIds: response.personalization.overriddenProblemIds,
              authenticated: true,
            };
      set({ bundled, ...effective, status: "ready", error: null });
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
      loadPromise = load()
        .catch(() => {})
        .finally(() => {
          loadPromise = null;
        });
    }
    return loadPromise;
  },

  saveProblem: async (problem) => {
    const { authenticated, bundled, load } = get();
    if (problem.origin === "bundled") {
      if (authenticated) {
        await updateBundledProblem(problem.id, problem);
        await load();
      } else {
        saveOverride(problem);
        set(localEffectiveState(bundled));
      }
      return;
    }
    saveCustomProblem(problem);
    if (authenticated) {
      set((state) => ({
        problems: [...state.problems.filter((item) => item.id !== problem.id), problem],
      }));
    } else {
      set(localEffectiveState(bundled));
    }
  },

  deleteProblem: async (id) => {
    const { authenticated, bundled, load, problems } = get();
    const problem = problems.find((item) => item.id === id);
    if (problem?.origin === "bundled") {
      if (authenticated) {
        await hideBundledProblemOnServer(id);
        await load();
      } else {
        hideBundledProblem(id);
        set(localEffectiveState(bundled));
      }
      return;
    }
    deleteCustomProblem(id);
    if (authenticated) {
      set((state) => ({ problems: state.problems.filter((item) => item.id !== id) }));
    } else {
      set(localEffectiveState(bundled));
    }
  },

  restoreProblem: async (id) => {
    const { authenticated, bundled, load } = get();
    if (authenticated) {
      await restoreBundledProblemOnServer(id);
      await load();
    } else {
      restoreBundledProblem(id);
      set(localEffectiveState(bundled));
    }
  },

  resetProblem: async (id) => {
    const { authenticated, bundled, load, overriddenProblemIds } = get();
    if (!overriddenProblemIds.includes(id)) return;
    if (authenticated) {
      await resetBundledProblemOnServer(id);
      await load();
    } else {
      clearOverride(id);
      set(localEffectiveState(bundled));
    }
  },
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
  const problem = useLibrary.getState().problems.find((p) => p.id === problemId);
  const solution = problem?.solutions.find((s) => s.id === solutionId);
  if (problem === undefined || solution === undefined) return null;
  return { problem, solution };
}
