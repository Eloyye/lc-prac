import { create } from "zustand";
import type { Mode, SavedBestScore } from "@shared/types";
import { listBestScores } from "../api/stats";

export type HistoryStatus = "idle" | "loading" | "ready" | "error";

interface HistoryState {
  ownerUserId: string | null;
  bestScores: SavedBestScore[];
  status: HistoryStatus;
  error: string | null;
  load: () => Promise<void>;
  ensureLoaded: () => Promise<void>;
  reset: (ownerUserId?: string | null) => void;
  recordBestScore: (score: SavedBestScore, ownerUserId: string | null) => void;
}

let generation = 0;
let loadPromise: Promise<void> | null = null;

function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : "Could not load Personal Bests.";
}

export const useHistory = create<HistoryState>((set, get) => ({
  ownerUserId: null,
  bestScores: [],
  status: "idle",
  error: null,

  load: async () => {
    generation += 1;
    const requestGeneration = generation;
    set({ status: "loading", error: null });
    try {
      const response = await listBestScores();
      if (requestGeneration !== generation) return;
      set({ bestScores: response.bestScores, status: "ready", error: null });
    } catch (cause) {
      if (requestGeneration !== generation) return;
      set({ status: "error", error: message(cause) });
      throw cause;
    }
  },

  ensureLoaded: () => {
    if (get().status === "ready") return Promise.resolve();
    if (loadPromise === null) {
      const pending = get()
        .load()
        .catch(() => {});
      let tracked: Promise<void>;
      tracked = pending.finally(() => {
        if (loadPromise === tracked) loadPromise = null;
      });
      loadPromise = tracked;
    }
    return loadPromise;
  },

  reset: (ownerUserId = null) => {
    generation += 1;
    loadPromise = null;
    set({ ownerUserId, bestScores: [], status: "idle", error: null });
  },

  recordBestScore: (score, ownerUserId) => {
    set((state) => {
      if (ownerUserId === null || state.ownerUserId !== ownerUserId) return state;
      return {
        bestScores: [
          ...state.bestScores.filter(
            (candidate) =>
              candidate.problemId !== score.problemId ||
              candidate.solutionId !== score.solutionId ||
              candidate.mode !== score.mode,
          ),
          score,
        ],
      };
    });
  },
}));

/** Return exactly one Problem + Solution + Mode PB; Modes never bleed together. */
export function bestFor(
  bestScores: SavedBestScore[],
  problemId: string,
  solutionId: string,
  mode: Mode,
): SavedBestScore | undefined {
  return bestScores.find(
    (score) =>
      score.problemId === problemId && score.solutionId === solutionId && score.mode === mode,
  );
}
