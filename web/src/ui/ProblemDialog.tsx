import { useState } from "react";
import type { ReactNode } from "react";
import type { Example, Problem, Solution } from "@shared/types";

interface ProblemDialogProps {
  onClose: () => void;
  onSubmit: (problem: Problem) => void | Promise<void>;
  // When set, the dialog edits an existing Problem: fields are prefilled and its
  // id + origin are preserved on submit. When absent, it creates a new custom one.
  initial?: Problem;
}

type Difficulty = "easy" | "medium" | "hard";
const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];

// Editable form of a Solution: complexity is "" rather than undefined so the
// inputs stay controlled, and the existing `id` rides along so edits keep the
// Attempts/Personal Bests that point at it.
interface SolutionDraft {
  id: string;
  approach: string;
  timeComplexity: string;
  spaceComplexity: string;
  code: string;
}

const inputClass =
  "w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-500";

function toDraft(solution: Solution): SolutionDraft {
  return {
    id: solution.id,
    approach: solution.approach,
    timeComplexity: solution.timeComplexity ?? "",
    spaceComplexity: solution.spaceComplexity ?? "",
    code: solution.code,
  };
}

function emptyDraft(): SolutionDraft {
  return {
    id: crypto.randomUUID(),
    approach: "",
    timeComplexity: "",
    spaceComplexity: "",
    code: "",
  };
}

export function ProblemDialog({ onClose, onSubmit, initial }: ProblemDialogProps) {
  const editing = initial !== undefined;
  const [title, setTitle] = useState(initial?.title ?? "");
  const [difficulty, setDifficulty] = useState<Difficulty>(initial?.difficulty ?? "easy");
  const [tags, setTags] = useState(initial ? initial.tags.join(", ") : "");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [statement, setStatement] = useState(initial?.statement ?? "");
  const [expectedTime, setExpectedTime] = useState(initial?.expectedTime ?? "");
  const [expectedSpace, setExpectedSpace] = useState(initial?.expectedSpace ?? "");
  const [examples, setExamples] = useState<Example[]>(initial?.examples ?? []);
  const [solutions, setSolutions] = useState<SolutionDraft[]>(() =>
    initial && initial.solutions.length > 0 ? initial.solutions.map(toDraft) : [emptyDraft()],
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const addExample = (): void =>
    setExamples((xs) => [...xs, { input: "", output: "", explanation: "" }]);
  const removeExample = (index: number): void =>
    setExamples((xs) => xs.filter((_, i) => i !== index));
  const updateExample = (index: number, key: keyof Example, value: string): void =>
    setExamples((xs) => xs.map((ex, i) => (i === index ? { ...ex, [key]: value } : ex)));

  const addSolution = (): void => setSolutions((xs) => [...xs, emptyDraft()]);
  // Keep at least one row so the form always has somewhere to type code.
  const removeSolution = (id: string): void =>
    setSolutions((xs) => (xs.length <= 1 ? xs : xs.filter((s) => s.id !== id)));
  const updateSolution = (id: string, key: keyof SolutionDraft, value: string): void =>
    setSolutions((xs) => xs.map((s) => (s.id === id ? { ...s, [key]: value } : s)));

  const optional = (value: string): string | undefined =>
    value.trim() === "" ? undefined : value.trim();

  const submit = async (): Promise<void> => {
    // Drop rows with no code, keeping each kept row's id so history stays linked;
    // an Approach defaults to "Custom" so a row is never left unlabelled.
    const cleanedSolutions = solutions.flatMap((s): Solution[] => {
      const code = s.code.replace(/\r\n/g, "\n").replace(/\s+$/, "");
      if (code.trim() === "") return [];
      const time = s.timeComplexity.trim();
      const space = s.spaceComplexity.trim();
      return [
        {
          id: s.id,
          lang: "python",
          approach: s.approach.trim() === "" ? "Custom" : s.approach.trim(),
          ...(time === "" ? {} : { timeComplexity: time }),
          ...(space === "" ? {} : { spaceComplexity: space }),
          code,
        },
      ];
    });
    if (title.trim() === "" || cleanedSolutions.length === 0) {
      setError("A title and at least one solution (with code) are required.");
      return;
    }
    // Drop blank rows and empty explanations so optional Example fields stay
    // absent rather than persisting empty strings; an Example needs both sides.
    const cleanedExamples = examples.flatMap((ex): Example[] => {
      const input = ex.input.trim();
      const output = ex.output.trim();
      if (input === "" || output === "") return [];
      const explanation = ex.explanation?.trim() ?? "";
      return [explanation === "" ? { input, output } : { input, output, explanation }];
    });
    const problem: Problem = {
      id: initial?.id ?? crypto.randomUUID(),
      title: title.trim(),
      difficulty,
      tags: tags
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t !== ""),
      url: optional(url),
      // Editing preserves provenance: a bundled Problem stays bundled (its edit
      // is stored as an override), a custom one stays custom.
      origin: initial?.origin ?? "custom",
      statement: optional(statement),
      expectedTime: optional(expectedTime),
      expectedSpace: optional(expectedSpace),
      examples: cleanedExamples.length > 0 ? cleanedExamples : undefined,
      solutions: cleanedSolutions,
    };
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(problem);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save this Problem.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="flex max-h-full w-full max-w-lg flex-col gap-3 overflow-auto rounded-xl border border-neutral-700 bg-neutral-900 p-6">
        <h2 className="text-lg font-semibold text-neutral-100">
          {editing ? "Edit problem" : "Create custom problem"}
        </h2>

        <Field label="Title">
          <input
            className={inputClass}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Two Sum"
          />
        </Field>

        <Field label="Difficulty">
          <select
            className={inputClass}
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as Difficulty)}
          >
            {DIFFICULTIES.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Tags (comma-separated)">
          <input
            className={inputClass}
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="array, hash-map"
          />
        </Field>

        <Field label="Source URL (optional)">
          <input
            className={inputClass}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
          />
        </Field>

        <Field label="Description (optional, markdown)">
          <textarea
            className={`${inputClass} h-24 resize-none`}
            value={statement}
            onChange={(e) => setStatement(e.target.value)}
            placeholder={"Given an array `nums`, return…"}
          />
        </Field>

        <div className="flex gap-3">
          <Field label="Target time (optional)">
            <input
              className={inputClass}
              value={expectedTime}
              onChange={(e) => setExpectedTime(e.target.value)}
              placeholder="O(n)"
            />
          </Field>
          <Field label="Target space (optional)">
            <input
              className={inputClass}
              value={expectedSpace}
              onChange={(e) => setExpectedSpace(e.target.value)}
              placeholder="O(1)"
            />
          </Field>
        </div>

        <div className="flex flex-col gap-1.5 text-left">
          <span className="text-xs uppercase tracking-wide text-neutral-500">
            Examples (optional)
          </span>
          {examples.map((example, index) => (
            <div
              key={index}
              className="flex flex-col gap-1.5 rounded-lg border border-neutral-800 p-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-neutral-500">Example {index + 1}</span>
                <button
                  type="button"
                  onClick={() => removeExample(index)}
                  className="text-xs text-neutral-500 hover:text-red-400"
                >
                  Remove
                </button>
              </div>
              <input
                className={`${inputClass} font-mono`}
                value={example.input}
                onChange={(e) => updateExample(index, "input", e.target.value)}
                placeholder="Input — nums = [1, 2, 3]"
                spellCheck={false}
              />
              <input
                className={`${inputClass} font-mono`}
                value={example.output}
                onChange={(e) => updateExample(index, "output", e.target.value)}
                placeholder="Output — 6"
                spellCheck={false}
              />
              <input
                className={inputClass}
                value={example.explanation ?? ""}
                onChange={(e) => updateExample(index, "explanation", e.target.value)}
                placeholder="Explanation (optional)"
              />
            </div>
          ))}
          <button
            type="button"
            onClick={addExample}
            className="self-start rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:border-neutral-500"
          >
            + Add example
          </button>
        </div>

        <div className="flex flex-col gap-1.5 text-left">
          <span className="text-xs uppercase tracking-wide text-neutral-500">Solutions</span>
          {solutions.map((solution, index) => (
            <div
              key={solution.id}
              className="flex flex-col gap-1.5 rounded-lg border border-neutral-800 p-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-neutral-500">Approach {index + 1}</span>
                {solutions.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeSolution(solution.id)}
                    className="text-xs text-neutral-500 hover:text-red-400"
                  >
                    Remove
                  </button>
                )}
              </div>
              <input
                className={inputClass}
                value={solution.approach}
                onChange={(e) => updateSolution(solution.id, "approach", e.target.value)}
                placeholder="Approach — Hash map"
              />
              <div className="flex gap-1.5">
                <input
                  className={`${inputClass} font-mono`}
                  value={solution.timeComplexity}
                  onChange={(e) => updateSolution(solution.id, "timeComplexity", e.target.value)}
                  placeholder="Time — O(n)"
                  spellCheck={false}
                />
                <input
                  className={`${inputClass} font-mono`}
                  value={solution.spaceComplexity}
                  onChange={(e) => updateSolution(solution.id, "spaceComplexity", e.target.value)}
                  placeholder="Space — O(1)"
                  spellCheck={false}
                />
              </div>
              <textarea
                className={`${inputClass} h-40 resize-none font-mono`}
                value={solution.code}
                onChange={(e) => updateSolution(solution.id, "code", e.target.value)}
                placeholder={"class Solution:\n    ..."}
                spellCheck={false}
              />
            </div>
          ))}
          <button
            type="button"
            onClick={addSolution}
            className="self-start rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:border-neutral-500"
          >
            + Add approach
          </button>
        </div>

        {error !== null && <p className="text-sm text-red-400">{error}</p>}

        <div className="mt-1 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={submitting}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-wait disabled:opacity-60"
          >
            {submitting ? "Saving…" : editing ? "Save" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-1 flex-col gap-1 text-left">
      <span className="text-xs uppercase tracking-wide text-neutral-500">{label}</span>
      {children}
    </label>
  );
}
