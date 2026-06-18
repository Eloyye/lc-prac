import { describe, expect, it } from "vitest";
import type { Problem } from "../types";
import { nextPracticeTarget } from "./next";

function problem(id: string, difficulty: Problem["difficulty"], tags: string[]): Problem {
  return {
    id,
    title: id,
    difficulty,
    tags,
    origin: "bundled",
    solutions: [{ id: `${id}-solution`, lang: "python", approach: "First", code: "pass" }],
  };
}

const problems = [
  problem("one", "easy", ["array"]),
  problem("two", "medium", ["graph"]),
  problem("three", "easy", ["array"]),
];

describe("nextPracticeTarget", () => {
  it("selects the next problem and its first solution", () => {
    expect(nextPracticeTarget(problems, "one", "one-solution", {})).toMatchObject({
      problem: { id: "two" },
      solution: { id: "two-solution" },
    });
  });

  it("uses the filtered Library order and wraps", () => {
    expect(
      nextPracticeTarget(problems, "one", "one-solution", { difficulty: "easy" })?.problem.id,
    ).toBe("three");
    expect(
      nextPracticeTarget(problems, "three", "three-solution", { difficulty: "easy" })?.problem.id,
    ).toBe("one");
  });

  it("starts at the first filtered problem when the current one is excluded", () => {
    expect(nextPracticeTarget(problems, "two", "two-solution", { tag: "array" })?.problem.id).toBe(
      "one",
    );
  });

  it("uses another Solution when only the current Problem is filtered", () => {
    const only = {
      ...problems[0]!,
      solutions: [
        problems[0]!.solutions[0]!,
        { id: "alternate", lang: "python" as const, approach: "Alternate", code: "pass" },
      ],
    };
    expect(nextPracticeTarget([only], "one", "one-solution", {})?.solution.id).toBe("alternate");
    expect(nextPracticeTarget(problems, "one", "one-solution", { q: "one" })).toBeNull();
  });
});
