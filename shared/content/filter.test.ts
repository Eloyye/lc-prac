import { describe, it, expect } from "vitest";
import type { Problem } from "../types";
import { allTags, filterProblems } from "./filter";

function make(
  id: string,
  title: string,
  difficulty: Problem["difficulty"],
  tags: string[],
): Problem {
  return {
    id,
    title,
    difficulty,
    tags,
    origin: "bundled",
    solutions: [{ id: `${id}-s`, lang: "python", approach: "x", code: "pass" }],
  };
}

const problems: Problem[] = [
  make("a", "Two Sum", "easy", ["array", "hash-map"]),
  make("b", "Group Anagrams", "medium", ["hash-map", "string"]),
  make("c", "Binary Search", "easy", ["binary-search", "array"]),
];

const base = { query: "", difficulty: "all" as const, tag: null };

describe("allTags", () => {
  it("returns sorted, de-duplicated tags", () => {
    expect(allTags(problems)).toEqual(["array", "binary-search", "hash-map", "string"]);
  });
});

describe("filterProblems", () => {
  it("returns everything with an empty filter", () => {
    expect(filterProblems(problems, base)).toHaveLength(3);
  });

  it("filters by difficulty", () => {
    expect(filterProblems(problems, { ...base, difficulty: "medium" }).map((p) => p.id)).toEqual([
      "b",
    ]);
  });

  it("filters by tag", () => {
    expect(filterProblems(problems, { ...base, tag: "array" }).map((p) => p.id)).toEqual([
      "a",
      "c",
    ]);
  });

  it("matches the query against title and tags", () => {
    expect(filterProblems(problems, { ...base, query: "anagram" }).map((p) => p.id)).toEqual(["b"]);
    expect(filterProblems(problems, { ...base, query: "binary" }).map((p) => p.id)).toEqual(["c"]);
  });
});
