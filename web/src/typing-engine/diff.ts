export type CharState = "correct" | "incorrect";

/**
 * Positional comparison of typed `input` against `target`.
 * Result length === input.length. Characters typed past the end of the
 * target count as incorrect (excess).
 */
export function diffStatuses(target: string, input: string): CharState[] {
  const states: CharState[] = [];
  for (let i = 0; i < input.length; i++) {
    states.push(input[i] === target[i] ? "correct" : "incorrect");
  }
  return states;
}

/** Number of positions in `input` that match `target`. */
export function correctCharCount(target: string, input: string): number {
  let count = 0;
  for (let i = 0; i < input.length; i++) {
    if (input[i] === target[i]) count++;
  }
  return count;
}

/** A run is complete only on an exact match of the full target. */
export function isComplete(target: string, input: string): boolean {
  return input === target;
}
