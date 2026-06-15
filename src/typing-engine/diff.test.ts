import { describe, it, expect } from "vitest";
import { correctCharCount, diffStatuses, isComplete } from "./diff";

describe("diffStatuses", () => {
  it("marks matching characters correct and mismatches incorrect", () => {
    expect(diffStatuses("abc", "abx")).toEqual(["correct", "correct", "incorrect"]);
  });

  it("marks characters typed past the target as incorrect", () => {
    expect(diffStatuses("ab", "abc")).toEqual(["correct", "correct", "incorrect"]);
  });

  it("returns an empty array for empty input", () => {
    expect(diffStatuses("abc", "")).toEqual([]);
  });
});

describe("correctCharCount", () => {
  it("counts matching positions", () => {
    expect(correctCharCount("hello", "help")).toBe(3);
  });
});

describe("isComplete", () => {
  it("is true only on an exact match", () => {
    expect(isComplete("abc", "abc")).toBe(true);
    expect(isComplete("abc", "ab")).toBe(false);
    expect(isComplete("abc", "abcd")).toBe(false);
  });
});
