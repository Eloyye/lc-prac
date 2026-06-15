import type { Problem } from "../types";

// TODO: REMOVE HARDCODE problems in later milestones

export const PROBLEMS: Problem[] = [
  {
    id: "two-sum",
    title: "Two Sum",
    difficulty: "easy",
    tags: ["array", "hash-map"],
    url: "https://leetcode.com/problems/two-sum/",
    origin: "bundled",
    solutions: [
      {
        id: "two-sum-hashmap",
        lang: "python",
        approach: "Hash map, one pass",
        timeComplexity: "O(n)",
        spaceComplexity: "O(n)",
        code: `class Solution:
    def twoSum(self, nums: list[int], target: int) -> list[int]:
        seen: dict[int, int] = {}
        for i, n in enumerate(nums):
            complement = target - n
            if complement in seen:
                return [seen[complement], i]
            seen[n] = i
        return []`,
      },
    ],
  },
];
