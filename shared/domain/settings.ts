import type { Mode } from "./mode";

export interface Settings {
  mode: Mode;
  distractionFree: boolean;
}

/** Account-backed Settings plus server-owned synchronization metadata. */
export interface SavedSettings extends Settings {
  updatedAt: string;
}
