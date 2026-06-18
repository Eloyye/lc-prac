import type { Problem } from "../types";

export type DifficultyFilter = "all" | "easy" | "medium" | "hard";

export interface LibrarySearch {
  q?: string;
  difficulty?: Exclude<DifficultyFilter, "all">;
  tag?: string;
}

export interface ProblemFilter {
  query: string;
  difficulty: DifficultyFilter;
  tag: string | null;
}

export function filterFromSearch(search: LibrarySearch): ProblemFilter {
  return {
    query: search.q ?? "",
    difficulty: search.difficulty ?? "all",
    tag: search.tag ?? null,
  };
}

/** Sorted, de-duplicated list of every tag across the given problems. */
export function allTags(problems: Problem[]): string[] {
  const tags = new Set<string>();
  for (const problem of problems) {
    for (const tag of problem.tags) tags.add(tag);
  }
  return [...tags].sort();
}

export function filterProblems(problems: Problem[], filter: ProblemFilter): Problem[] {
  const query = filter.query.trim().toLowerCase();
  return problems.filter((problem) => {
    if (filter.difficulty !== "all" && problem.difficulty !== filter.difficulty) {
      return false;
    }
    if (filter.tag !== null && !problem.tags.includes(filter.tag)) {
      return false;
    }
    if (query !== "") {
      const inTitle = problem.title.toLowerCase().includes(query);
      const inTags = problem.tags.some((tag) => tag.includes(query));
      if (!inTitle && !inTags) return false;
    }
    return true;
  });
}
