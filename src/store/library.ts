import { create } from "zustand";
import type { Problem } from "../types";
import { PROBLEMS } from "../content/problems";
import { deleteCustomProblem, loadCustomProblems, saveCustomProblem } from "../persistence/storage";

interface LibraryState {
  /** Bundled problems merged with user-imported (custom) ones. */
  problems: Problem[];
  addCustom: (problem: Problem) => void;
  removeCustom: (id: string) => void;
}

function merged(): Problem[] {
  return [...PROBLEMS, ...loadCustomProblems()];
}

export const useLibrary = create<LibraryState>((set) => ({
  problems: merged(),
  addCustom: (problem) => {
    saveCustomProblem(problem);
    set({ problems: merged() });
  },
  removeCustom: (id) => {
    deleteCustomProblem(id);
    set({ problems: merged() });
  },
}));
