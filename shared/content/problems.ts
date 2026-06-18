import type { Problem } from "../types";

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
      {
        id: "two-sum-brute",
        lang: "python",
        approach: "Brute force",
        timeComplexity: "O(n^2)",
        spaceComplexity: "O(1)",
        code: `class Solution:
    def twoSum(self, nums: list[int], target: int) -> list[int]:
        for i in range(len(nums)):
            for j in range(i + 1, len(nums)):
                if nums[i] + nums[j] == target:
                    return [i, j]
        return []`,
      },
    ],
  },
  {
    id: "valid-parentheses",
    title: "Valid Parentheses",
    difficulty: "easy",
    tags: ["stack", "string"],
    url: "https://leetcode.com/problems/valid-parentheses/",
    origin: "bundled",
    solutions: [
      {
        id: "valid-parentheses-stack",
        lang: "python",
        approach: "Stack",
        timeComplexity: "O(n)",
        spaceComplexity: "O(n)",
        code: `class Solution:
    def isValid(self, s: str) -> bool:
        pairs = {")": "(", "]": "[", "}": "{"}
        stack: list[str] = []
        for ch in s:
            if ch in pairs:
                if not stack or stack.pop() != pairs[ch]:
                    return False
            else:
                stack.append(ch)
        return not stack`,
      },
    ],
  },
  {
    id: "binary-search",
    title: "Binary Search",
    difficulty: "easy",
    tags: ["binary-search", "array"],
    url: "https://leetcode.com/problems/binary-search/",
    origin: "bundled",
    solutions: [
      {
        id: "binary-search-iterative",
        lang: "python",
        approach: "Iterative",
        timeComplexity: "O(log n)",
        spaceComplexity: "O(1)",
        code: `class Solution:
    def search(self, nums: list[int], target: int) -> int:
        lo, hi = 0, len(nums) - 1
        while lo <= hi:
            mid = (lo + hi) // 2
            if nums[mid] == target:
                return mid
            if nums[mid] < target:
                lo = mid + 1
            else:
                hi = mid - 1
        return -1`,
      },
    ],
  },
  {
    id: "reverse-linked-list",
    title: "Reverse Linked List",
    difficulty: "easy",
    tags: ["linked-list", "recursion"],
    url: "https://leetcode.com/problems/reverse-linked-list/",
    origin: "bundled",
    solutions: [
      {
        id: "reverse-linked-list-iterative",
        lang: "python",
        approach: "Iterative",
        timeComplexity: "O(n)",
        spaceComplexity: "O(1)",
        code: `class Solution:
    def reverseList(self, head: ListNode | None) -> ListNode | None:
        prev = None
        while head:
            nxt = head.next
            head.next = prev
            prev = head
            head = nxt
        return prev`,
      },
      {
        id: "reverse-linked-list-recursive",
        lang: "python",
        approach: "Recursive",
        timeComplexity: "O(n)",
        spaceComplexity: "O(n)",
        code: `class Solution:
    def reverseList(self, head: ListNode | None) -> ListNode | None:
        if head is None or head.next is None:
            return head
        new_head = self.reverseList(head.next)
        head.next.next = head
        head.next = None
        return new_head`,
      },
    ],
  },
  {
    id: "maximum-subarray",
    title: "Maximum Subarray",
    difficulty: "medium",
    tags: ["array", "dynamic-programming"],
    url: "https://leetcode.com/problems/maximum-subarray/",
    origin: "bundled",
    solutions: [
      {
        id: "maximum-subarray-kadane",
        lang: "python",
        approach: "Kadane's algorithm",
        timeComplexity: "O(n)",
        spaceComplexity: "O(1)",
        code: `class Solution:
    def maxSubArray(self, nums: list[int]) -> int:
        best = cur = nums[0]
        for n in nums[1:]:
            cur = max(n, cur + n)
            best = max(best, cur)
        return best`,
      },
    ],
  },
  {
    id: "climbing-stairs",
    title: "Climbing Stairs",
    difficulty: "easy",
    tags: ["dynamic-programming", "math"],
    url: "https://leetcode.com/problems/climbing-stairs/",
    origin: "bundled",
    solutions: [
      {
        id: "climbing-stairs-iterative",
        lang: "python",
        approach: "Iterative, O(1) space",
        timeComplexity: "O(n)",
        spaceComplexity: "O(1)",
        code: `class Solution:
    def climbStairs(self, n: int) -> int:
        a, b = 1, 1
        for _ in range(n):
            a, b = b, a + b
        return a`,
      },
      {
        id: "climbing-stairs-memo",
        lang: "python",
        approach: "Top-down memoization",
        timeComplexity: "O(n)",
        spaceComplexity: "O(n)",
        code: `class Solution:
    def climbStairs(self, n: int) -> int:
        from functools import cache

        @cache
        def ways(i: int) -> int:
            if i <= 2:
                return i
            return ways(i - 1) + ways(i - 2)

        return ways(n)`,
      },
    ],
  },
  {
    id: "contains-duplicate",
    title: "Contains Duplicate",
    difficulty: "easy",
    tags: ["array", "hash-set"],
    url: "https://leetcode.com/problems/contains-duplicate/",
    origin: "bundled",
    solutions: [
      {
        id: "contains-duplicate-set",
        lang: "python",
        approach: "Set size comparison",
        timeComplexity: "O(n)",
        spaceComplexity: "O(n)",
        code: `class Solution:
    def containsDuplicate(self, nums: list[int]) -> bool:
        return len(set(nums)) != len(nums)`,
      },
    ],
  },
  {
    id: "group-anagrams",
    title: "Group Anagrams",
    difficulty: "medium",
    tags: ["hash-map", "string", "sorting"],
    url: "https://leetcode.com/problems/group-anagrams/",
    origin: "bundled",
    solutions: [
      {
        id: "group-anagrams-sort-key",
        lang: "python",
        approach: "Sorted-string key",
        timeComplexity: "O(n k log k)",
        spaceComplexity: "O(n k)",
        code: `class Solution:
    def groupAnagrams(self, strs: list[str]) -> list[list[str]]:
        groups: dict[str, list[str]] = {}
        for s in strs:
            key = "".join(sorted(s))
            groups.setdefault(key, []).append(s)
        return list(groups.values())`,
      },
    ],
  },
  {
    id: "number-of-islands",
    title: "Number of Islands",
    difficulty: "medium",
    tags: ["graph", "dfs", "matrix"],
    url: "https://leetcode.com/problems/number-of-islands/",
    origin: "bundled",
    solutions: [
      {
        id: "number-of-islands-dfs",
        lang: "python",
        approach: "DFS flood fill",
        timeComplexity: "O(m n)",
        spaceComplexity: "O(m n)",
        code: `class Solution:
    def numIslands(self, grid: list[list[str]]) -> int:
        rows, cols = len(grid), len(grid[0])

        def sink(r: int, c: int) -> None:
            if r < 0 or r >= rows or c < 0 or c >= cols or grid[r][c] != "1":
                return
            grid[r][c] = "0"
            sink(r + 1, c)
            sink(r - 1, c)
            sink(r, c + 1)
            sink(r, c - 1)

        count = 0
        for r in range(rows):
            for c in range(cols):
                if grid[r][c] == "1":
                    count += 1
                    sink(r, c)
        return count`,
      },
    ],
  },
  // Original, self-authored content (not from LeetCode) so the statement and
  // examples can ship bundled without tripping PRD §12 — and so the detail
  // page's Description / Requirements / Examples surfaces have something to
  // render out of the box. Bundled LeetCode Problems above stay link-out only.
  {
    id: "array-sum",
    title: "Array Sum",
    difficulty: "easy",
    tags: ["array", "math"],
    origin: "bundled",
    statement:
      "Given an array of integers `nums`, return the **sum** of all its elements.\n\nAn empty array sums to `0`.",
    expectedTime: "O(n)",
    expectedSpace: "O(1)",
    examples: [
      { input: "nums = [1, 2, 3]", output: "6", explanation: "1 + 2 + 3 = 6." },
      {
        input: "nums = [-2, 5, -1]",
        output: "2",
        explanation: "Negatives count too: -2 + 5 + -1 = 2.",
      },
      { input: "nums = []", output: "0", explanation: "An empty array sums to zero." },
    ],
    solutions: [
      {
        id: "array-sum-loop",
        lang: "python",
        approach: "Accumulator loop",
        timeComplexity: "O(n)",
        spaceComplexity: "O(1)",
        code: `class Solution:
    def arraySum(self, nums: list[int]) -> int:
        total = 0
        for n in nums:
            total += n
        return total`,
      },
      {
        id: "array-sum-builtin",
        lang: "python",
        approach: "Built-in sum",
        timeComplexity: "O(n)",
        spaceComplexity: "O(1)",
        code: `class Solution:
    def arraySum(self, nums: list[int]) -> int:
        return sum(nums)`,
      },
    ],
  },
];
