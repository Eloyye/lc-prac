import { create } from "zustand";
import type { Problem, Solution } from "@shared/types";
import {
  archiveProblem,
  createProblem,
  hideBundledProblem as hideBundledProblemOnServer,
  listProblems,
  permanentlyDeleteProblem as permanentlyDeleteProblemRequest,
  resetBundledProblem as resetBundledProblemOnServer,
  restoreBundledProblem as restoreBundledProblemOnServer,
  restoreProblem as restoreProblemRequest,
  updateBundledProblem,
  updateProblem,
} from "../api/problems";
import {
  clearOverride,
  hideBundledProblem,
  loadHidden,
  loadOverrides,
  mergedLibrary,
  restoreBundledProblem,
  saveOverride,
} from "../persistence/storage";

export type LibraryStatus = "idle" | "loading" | "ready" | "error";

interface LibraryState {
  /** Effective active Library: personalized bundled Problems plus server customs. */
  problems: Problem[];
  bundled: Problem[];
  custom: Problem[];
  hiddenProblems: Problem[];
  overriddenProblemIds: string[];
  authenticated: boolean;
  /** Owned custom Problems outside the active Library. */
  archived: Problem[];
  status: LibraryStatus;
  error: string | null;
  actionError: string | null;
  load: () => Promise<void>;
  ensureLoaded: () => Promise<void>;
  /** Create/update custom Problems and authenticated bundled Overrides remotely. */
  saveProblem: (problem: Problem) => Promise<void>;
  /** Archive a custom Problem or Tombstone a bundled Problem. */
  deleteProblem: (id: string) => Promise<void>;
  restoreProblem: (id: string) => Promise<void>;
  permanentlyDeleteProblem: (id: string) => Promise<void>;
  resetProblem: (id: string) => Promise<void>;
  clearActionError: () => void;
}

function isBundledId(bundled: Problem[], id: string): boolean {
  return bundled.some((problem) => problem.id === id);
}

function effectiveProblems(bundled: Problem[], custom: Problem[]): Problem[] {
  // Authenticated bundled and custom state is already effective server state.
  return [...bundled, ...custom];
}

function localBundledState(bundled: Problem[]): {
  problems: Problem[];
  hiddenProblems: Problem[];
  overriddenProblemIds: string[];
} {
  const overrides = loadOverrides();
  const hiddenIds = new Set(loadHidden());
  return {
    problems: mergedLibrary(bundled).filter((problem) => problem.origin === "bundled"),
    hiddenProblems: bundled
      .filter((problem) => hiddenIds.has(problem.id))
      .map((problem) => overrides[problem.id] ?? problem),
    overriddenProblemIds: Object.keys(overrides),
  };
}

function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : "The Problem change failed.";
}

let loadPromise: Promise<void> | null = null;

export const useLibrary = create<LibraryState>((set, get) => ({
  problems: [],
  bundled: [],
  custom: [],
  hiddenProblems: [],
  overriddenProblemIds: [],
  authenticated: false,
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
      const personalization = activeResult.personalization;
      const authenticated = personalization !== null && personalization !== undefined;
      const local = authenticated ? null : localBundledState(bundled);
      set({
        bundled,
        custom,
        archived: archivedResult.problems,
        problems: [...(local?.problems ?? bundled), ...custom],
        hiddenProblems: personalization?.hiddenProblems ?? local?.hiddenProblems ?? [],
        overriddenProblemIds:
          personalization?.overriddenProblemIds ?? local?.overriddenProblemIds ?? [],
        authenticated,
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
    const { authenticated, bundled, custom, load } = get();
    set({ actionError: null });
    if (isBundledId(bundled, problem.id)) {
      try {
        if (authenticated) {
          await updateBundledProblem(problem);
          await load();
        } else {
          saveOverride(problem);
          const local = localBundledState(bundled);
          set({ ...local, problems: [...local.problems, ...custom] });
        }
      } catch (cause) {
        set({ actionError: message(cause) });
        throw cause;
      }
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
    const { authenticated, bundled, custom, archived, load } = get();
    set({ actionError: null });
    if (isBundledId(bundled, id)) {
      try {
        if (authenticated) {
          await hideBundledProblemOnServer(id);
          await load();
        } else {
          hideBundledProblem(id);
          const local = localBundledState(bundled);
          set({ ...local, problems: [...local.problems, ...custom] });
        }
      } catch (cause) {
        set({ actionError: message(cause) });
        throw cause;
      }
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
    const { authenticated, bundled, custom, archived, hiddenProblems, load } = get();
    set({ actionError: null });
    try {
      if (hiddenProblems.some((problem) => problem.id === id)) {
        if (authenticated) {
          await restoreBundledProblemOnServer(id);
          await load();
        } else {
          restoreBundledProblem(id);
          const local = localBundledState(bundled);
          set({ ...local, problems: [...local.problems, ...custom] });
        }
        return;
      }
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

  resetProblem: async (id) => {
    const { authenticated, bundled, custom, overriddenProblemIds, load } = get();
    if (!overriddenProblemIds.includes(id)) return;
    set({ actionError: null });
    try {
      if (authenticated) {
        await resetBundledProblemOnServer(id);
        await load();
      } else {
        clearOverride(id);
        const local = localBundledState(bundled);
        set({ ...local, problems: [...local.problems, ...custom] });
      }
    } catch (cause) {
      set({ actionError: message(cause) });
      throw cause;
    }
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
