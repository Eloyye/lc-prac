import { create } from "zustand";
import { loadSettings, saveSettings } from "../persistence/storage";
import type { Mode, Settings } from "@shared/types";
import { getSettings, replaceSettings } from "../api/settings";

type PreferencesStatus = "loading" | "ready" | "error";

interface PreferencesState extends Settings {
  paletteOpen: boolean;
  settingsOpen: boolean;
  ownerUserId: string | null;
  status: PreferencesStatus;
  loadForOwner: (userId: string | null) => Promise<void>;
  setMode: (mode: Mode) => void;
  setDistractionFree: (enabled: boolean) => void;
  toggleDistractionFree: () => void;
  openPalette: () => void;
  closePalette: () => void;
  openSettings: () => void;
  closeSettings: () => void;
}

const initial = loadSettings();
let loadVersion = 0;
let settingsRevision = 0;
let writeQueue = Promise.resolve();

function persist(ownerUserId: string | null, settings: Settings, revision: number): void {
  if (ownerUserId === null) {
    saveSettings(settings);
    return;
  }

  // Serialize full-document replacements so rapid changes cannot arrive at the
  // server out of order and make an older value authoritative.
  writeQueue = writeQueue
    .catch(() => undefined)
    .then(async () => {
      await replaceSettings(settings);
      if (usePreferences.getState().ownerUserId === ownerUserId && settingsRevision === revision) {
        usePreferences.setState({ status: "ready" });
      }
    })
    .catch(() => {
      if (usePreferences.getState().ownerUserId === ownerUserId && settingsRevision === revision) {
        usePreferences.setState({ status: "error" });
      }
    });
}

export const usePreferences = create<PreferencesState>((set) => ({
  ...initial,
  paletteOpen: false,
  settingsOpen: false,
  ownerUserId: null,
  status: "ready",
  loadForOwner: async (ownerUserId) => {
    const version = ++loadVersion;
    const revision = ++settingsRevision;
    if (ownerUserId === null) {
      set({ ...loadSettings(), ownerUserId, status: "ready" });
      return;
    }

    set({ ownerUserId, status: "loading" });
    try {
      const { settings } = await getSettings();
      if (loadVersion !== version || settingsRevision !== revision) return;
      set({
        mode: settings.mode,
        distractionFree: settings.distractionFree,
        status: "ready",
      });
    } catch {
      if (loadVersion === version) set({ status: "error" });
    }
  },
  setMode: (mode) =>
    set((state) => {
      const revision = ++settingsRevision;
      const settings = { mode, distractionFree: state.distractionFree };
      persist(state.ownerUserId, settings, revision);
      return { ...settings, status: state.ownerUserId === null ? "ready" : "loading" };
    }),
  setDistractionFree: (distractionFree) =>
    set((state) => {
      const revision = ++settingsRevision;
      const settings = { mode: state.mode, distractionFree };
      persist(state.ownerUserId, settings, revision);
      return { ...settings, status: state.ownerUserId === null ? "ready" : "loading" };
    }),
  toggleDistractionFree: () =>
    set((state) => {
      const revision = ++settingsRevision;
      const settings = { mode: state.mode, distractionFree: !state.distractionFree };
      persist(state.ownerUserId, settings, revision);
      return { ...settings, status: state.ownerUserId === null ? "ready" : "loading" };
    }),
  openPalette: () => set({ paletteOpen: true }),
  closePalette: () => set({ paletteOpen: false }),
  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),
}));
