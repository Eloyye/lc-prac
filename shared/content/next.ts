import { filterFromSearch, filterProblems } from "./filter";
import type { LibrarySearch } from "./filter";
import type { Problem, Solution } from "../types";

export interface PracticeTarget {
  problem: Problem;
  solution: Solution;
}

/** Select the following Problem in the current filtered Library, wrapping at the end. */
export function nextPracticeTarget(
  problems: Problem[],
  currentProblemId: string,
  currentSolutionId: string,
  search: LibrarySearch,
): PracticeTarget | null {
  const practiceable = filterProblems(problems, filterFromSearch(search)).filter(
    (problem) => problem.solutions.length > 0,
  );

  if (practiceable.length === 0) return null;
  const currentIndex = practiceable.findIndex((problem) => problem.id === currentProblemId);
  if (practiceable.length === 1 && currentIndex === 0) {
    const problem = practiceable[0];
    if (problem === undefined || problem.solutions.length < 2) return null;
    const currentSolutionIndex = problem.solutions.findIndex(
      (solution) => solution.id === currentSolutionId,
    );
    const solution = problem.solutions[(currentSolutionIndex + 1) % problem.solutions.length];
    return solution === undefined ? null : { problem, solution };
  }
  const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % practiceable.length;
  const problem = practiceable[nextIndex];
  const solution = problem?.solutions[0];
  return problem === undefined || solution === undefined ? null : { problem, solution };
}
