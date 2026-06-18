import type { Problem } from "@shared/types";

/** Tailwind text-color class per Problem difficulty, shared across the Library UI. */
export const DIFFICULTY_COLOR: Record<Problem["difficulty"], string> = {
  easy: "text-emerald-400",
  medium: "text-amber-400",
  hard: "text-red-400",
};
