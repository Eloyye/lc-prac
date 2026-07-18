import { create } from "zustand";
import type { LocalDataImportReport } from "@shared/types";
import {
  getLocalDataImportStatus,
  importLocalData,
  skipLocalDataImport,
} from "../api/local-data-import";
import {
  hasEligibleLocalData,
  localDataImportToken,
  localDataSnapshot,
} from "../persistence/storage";
import type { LocalDataSnapshot } from "../persistence/storage";

export type LocalDataImportStatus =
  | "idle"
  | "checking"
  | "prompt"
  | "submitting"
  | "result"
  | "error";

type ImportAction = "check" | "import" | "skip";

interface LocalDataImportState {
  ownerUserId: string | null;
  status: LocalDataImportStatus;
  snapshot: LocalDataSnapshot | null;
  report: LocalDataImportReport | null;
  error: string | null;
  failedAction: ImportAction | null;
  /** True means a modal decision is required before account hydration. */
  check: (userId: string) => Promise<boolean>;
  submitImport: () => Promise<boolean>;
  submitSkip: () => Promise<boolean>;
  backToPrompt: () => void;
  dismiss: () => void;
  reset: () => void;
}

let generation = 0;

function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : "The local data Import failed.";
}

export const useLocalDataImport = create<LocalDataImportState>((set, get) => ({
  ownerUserId: null,
  status: "idle",
  snapshot: null,
  report: null,
  error: null,
  failedAction: null,

  check: async (userId) => {
    const requestGeneration = ++generation;
    const snapshot = localDataSnapshot();
    if (!hasEligibleLocalData(snapshot)) {
      set({ ownerUserId: userId, status: "idle", snapshot, report: null, error: null });
      return false;
    }

    set({
      ownerUserId: userId,
      status: "checking",
      snapshot,
      report: null,
      error: null,
      failedAction: null,
    });
    try {
      const response = await getLocalDataImportStatus();
      if (generation !== requestGeneration || get().ownerUserId !== userId) return true;
      if (response.status === "complete") {
        set({ status: "idle", report: response.report });
        return false;
      }
      set({ status: "prompt" });
      return true;
    } catch (cause) {
      if (generation === requestGeneration) {
        set({ status: "error", error: message(cause), failedAction: "check" });
      }
      return true;
    }
  },

  submitImport: async () => {
    const { ownerUserId, snapshot } = get();
    if (ownerUserId === null || snapshot === null) return false;
    const requestGeneration = generation;
    set({ status: "submitting", error: null, failedAction: null });
    try {
      const response = await importLocalData({
        action: "import",
        idempotencyToken: localDataImportToken(ownerUserId),
        ...snapshot,
      });
      if (generation !== requestGeneration || get().ownerUserId !== ownerUserId) return false;
      set({ status: "result", report: response.report });
      return true;
    } catch (cause) {
      if (generation === requestGeneration) {
        set({ status: "error", error: message(cause), failedAction: "import" });
      }
      return false;
    }
  },

  submitSkip: async () => {
    const { ownerUserId } = get();
    if (ownerUserId === null) return false;
    const requestGeneration = generation;
    set({ status: "submitting", error: null, failedAction: null });
    try {
      const response = await skipLocalDataImport({
        action: "skip",
        idempotencyToken: localDataImportToken(ownerUserId),
      });
      if (generation !== requestGeneration || get().ownerUserId !== ownerUserId) return false;
      set({ status: "result", report: response.report });
      return true;
    } catch (cause) {
      if (generation === requestGeneration) {
        set({ status: "error", error: message(cause), failedAction: "skip" });
      }
      return false;
    }
  },

  backToPrompt: () => set({ status: "prompt", error: null, failedAction: null }),
  dismiss: () => set({ status: "idle", snapshot: null, error: null, failedAction: null }),
  reset: () => {
    generation += 1;
    set({
      ownerUserId: null,
      status: "idle",
      snapshot: null,
      report: null,
      error: null,
      failedAction: null,
    });
  },
}));
