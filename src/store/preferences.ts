import { create } from "zustand";
import { loadSettings, saveSettings } from "../persistence/storage";
import type { Mode, Settings } from "../types";

interface PreferencesState extends Settings {
  paletteOpen: boolean;
  settingsOpen: boolean;
  setMode: (mode: Mode) => void;
  setDistractionFree: (enabled: boolean) => void;
  toggleDistractionFree: () => void;
  openPalette: () => void;
  closePalette: () => void;
  openSettings: () => void;
  closeSettings: () => void;
}

const initial = loadSettings();

function persist(settings: Settings): void {
  saveSettings(settings);
}

export const usePreferences = create<PreferencesState>((set) => ({
  ...initial,
  paletteOpen: false,
  settingsOpen: false,
  setMode: (mode) =>
    set((state) => {
      const settings = { mode, distractionFree: state.distractionFree };
      persist(settings);
      return settings;
    }),
  setDistractionFree: (distractionFree) =>
    set((state) => {
      const settings = { mode: state.mode, distractionFree };
      persist(settings);
      return settings;
    }),
  toggleDistractionFree: () =>
    set((state) => {
      const settings = { mode: state.mode, distractionFree: !state.distractionFree };
      persist(settings);
      return settings;
    }),
  openPalette: () => set({ paletteOpen: true }),
  closePalette: () => set({ paletteOpen: false }),
  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),
}));
