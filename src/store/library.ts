import { create } from "zustand";
import type { Problem } from "../types";
import { PROBLEMS } from "../content/problems";
import {
  clearOverride,
  deleteCustomProblem,
  hideBundledProblem,
  mergedLibrary,
  saveCustomProblem,
  saveOverride,
} from "../persistence/storage";

// Whether an id belongs to a *bundled* Problem decides how it is stored: bundled
// edits/deletes go to the override/tombstone layer, custom ones to KEY_CUSTOM.
const BUNDLED_IDS = new Set(PROBLEMS.map((p) => p.id));
const isBundledId = (id: string): boolean => BUNDLED_IDS.has(id);

function merged(): Problem[] {
  return mergedLibrary(PROBLEMS);
}

interface LibraryState {
  /** Bundled problems (with user overrides applied, tombstoned ones removed) merged with custom ones. */
  problems: Problem[];
  /** Create or update a Problem — a bundled id writes an override, otherwise a custom Problem. */
  saveProblem: (problem: Problem) => void;
  /** Delete a Problem — a bundled id is tombstoned, otherwise the custom Problem is removed. */
  deleteProblem: (id: string) => void;
  /** Revert an edited bundled Problem to its shipped version; a no-op for custom ids. */
  resetProblem: (id: string) => void;
}

export const useLibrary = create<LibraryState>((set) => ({
  problems: merged(),
  saveProblem: (problem) => {
    if (isBundledId(problem.id)) {
      saveOverride(problem);
    } else {
      saveCustomProblem(problem);
    }
    set({ problems: merged() });
  },
  deleteProblem: (id) => {
    if (isBundledId(id)) {
      hideBundledProblem(id);
    } else {
      deleteCustomProblem(id);
    }
    set({ problems: merged() });
  },
  resetProblem: (id) => {
    if (!isBundledId(id)) return;
    clearOverride(id);
    set({ problems: merged() });
  },
}));
