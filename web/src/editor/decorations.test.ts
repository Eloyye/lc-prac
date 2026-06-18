import { describe, it, expect } from "vitest";
import { toRuns } from "./decorations";

describe("toRuns", () => {
  it("groups consecutive states into runs", () => {
    expect(toRuns(["correct", "correct", "incorrect", "correct"])).toEqual([
      { state: "correct", start: 0, end: 2 },
      { state: "incorrect", start: 2, end: 3 },
      { state: "correct", start: 3, end: 4 },
    ]);
  });

  it("returns an empty array for empty input", () => {
    expect(toRuns([])).toEqual([]);
  });
});
