import type { Problem } from "@shared/domain/problem";

type Difficulty = Problem["difficulty"];

/** Tailwind text-color class per Problem difficulty, shared across the Library UI. */
export const DIFFICULTY_COLOR: Record<Difficulty, string> = {
  easy: "text-mint",
  medium: "text-lemon",
  hard: "text-tomato",
};

/** Solid fill for the setlist stripe and selected difficulty pill. */
export const DIFFICULTY_FILL: Record<Difficulty, string> = {
  easy: "bg-mint",
  medium: "bg-lemon",
  hard: "bg-tomato",
};

/** Dark text that reads on top of `DIFFICULTY_FILL`. */
export const DIFFICULTY_INK: Record<Difficulty, string> = {
  easy: "text-mint-ink",
  medium: "text-lemon-ink",
  hard: "text-tomato-ink",
};

/** Outline for an unselected difficulty pill. */
export const DIFFICULTY_BORDER: Record<Difficulty, string> = {
  easy: "border-mint",
  medium: "border-lemon",
  hard: "border-tomato",
};

/** Row wash on hover/focus, tinted by difficulty. */
export const DIFFICULTY_HOVER: Record<Difficulty, string> = {
  easy: "hover:bg-mint/12 focus-within:bg-mint/12",
  medium: "hover:bg-lemon/12 focus-within:bg-lemon/12",
  hard: "hover:bg-tomato/12 focus-within:bg-tomato/12",
};
