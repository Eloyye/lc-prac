import type { CharState } from "../typing-engine";

export interface StateRun {
  state: CharState;
  /** Inclusive start offset. */
  start: number;
  /** Exclusive end offset. */
  end: number;
}

/** Groups consecutive same-state characters into runs for efficient decoration. */
export function toRuns(states: CharState[]): StateRun[] {
  const runs: StateRun[] = [];
  for (let i = 0; i < states.length; i++) {
    const state = states[i];
    const last = runs.at(-1);
    if (last !== undefined && last.state === state && last.end === i) {
      last.end = i + 1;
    } else {
      runs.push({ state: state as CharState, start: i, end: i + 1 });
    }
  }
  return runs;
}
