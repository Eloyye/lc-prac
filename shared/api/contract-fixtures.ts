/**
 * Wire payloads shared by browser and server tests. Each fixture is checked
 * against the request contract at compile time, and the key maps below must
 * list exactly that contract's required and optional fields, so a server test
 * can prove the parser agrees with the type the browser sends.
 */
import type { Problem, Solution } from "../domain/problem";
import type { CreateAttemptRequest } from "./attempts";

type RequiredKeys<T> = { [K in keyof T]-?: object extends Pick<T, K> ? never : K }[keyof T];
type OptionalKeys<T> = Exclude<keyof T, RequiredKeys<T>>;

/** Every key of `T` that the contract marks required (or optional), exactly once. */
export type KeyMap<K extends PropertyKey> = Record<K, true>;

export const CREATE_ATTEMPT_REQUIRED: KeyMap<RequiredKeys<CreateAttemptRequest>> = {
  id: true,
  problemId: true,
  solutionId: true,
  mode: true,
  cpm: true,
  wpm: true,
  accuracyPct: true,
  durationMs: true,
  totalKeystrokes: true,
  errorKeystrokes: true,
  correctChars: true,
};

export const CREATE_ATTEMPT_OPTIONAL: KeyMap<OptionalKeys<CreateAttemptRequest>> = {
  errorMap: true,
  createdAt: true,
};

/** Only the required Attempt fields, against a seeded bundled Problem. */
export const MINIMAL_CREATE_ATTEMPT = {
  id: "fixture-attempt",
  problemId: "two-sum",
  solutionId: "two-sum-hashmap",
  mode: "copy",
  cpm: 120,
  wpm: 24,
  accuracyPct: 90,
  durationMs: 3_000,
  totalKeystrokes: 40,
  errorKeystrokes: 4,
  correctChars: 36,
} satisfies CreateAttemptRequest;

export const FULL_CREATE_ATTEMPT = {
  ...MINIMAL_CREATE_ATTEMPT,
  id: "fixture-attempt-full",
  errorMap: { "12": 2 },
  createdAt: "2026-07-17T10:00:00.000Z",
} satisfies Required<CreateAttemptRequest>;

export const PROBLEM_WRITE_REQUIRED: KeyMap<RequiredKeys<Problem>> = {
  id: true,
  title: true,
  difficulty: true,
  tags: true,
  origin: true,
  solutions: true,
};

export const PROBLEM_WRITE_OPTIONAL: KeyMap<OptionalKeys<Problem>> = {
  url: true,
  statement: true,
  expectedTime: true,
  expectedSpace: true,
  examples: true,
};

export const SOLUTION_WRITE_REQUIRED: KeyMap<RequiredKeys<Solution>> = {
  id: true,
  lang: true,
  approach: true,
  code: true,
};

/** Only the required custom Problem write fields. */
export const MINIMAL_PROBLEM_WRITE = {
  id: "fixture-problem",
  title: "Fixture Problem",
  difficulty: "easy",
  tags: [],
  origin: "custom",
  solutions: [{ id: "fixture-solution", lang: "python", approach: "Direct", code: "pass" }],
} satisfies Problem;

export const FULL_PROBLEM_WRITE = {
  ...MINIMAL_PROBLEM_WRITE,
  id: "fixture-problem-full",
  url: "https://example.com/fixture",
  statement: "Return the answer.",
  expectedTime: "O(n)",
  expectedSpace: "O(1)",
  examples: [{ input: "x = 1", output: "1", explanation: "Identity." }],
  solutions: [
    {
      id: "fixture-solution-full",
      lang: "python",
      approach: "Direct",
      code: "pass",
      timeComplexity: "O(n)",
      spaceComplexity: "O(1)",
    },
  ],
} satisfies Required<Problem>;
