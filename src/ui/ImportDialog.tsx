import { useState } from "react";
import type { ReactNode } from "react";
import type { Example, Problem } from "../types";

interface ImportDialogProps {
  onClose: () => void;
  onAdd: (problem: Problem) => void;
}

type Difficulty = "easy" | "medium" | "hard";
const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];

const inputClass =
  "w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-500";

export function ImportDialog({ onClose, onAdd }: ImportDialogProps) {
  const [title, setTitle] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("easy");
  const [tags, setTags] = useState("");
  const [approach, setApproach] = useState("");
  const [url, setUrl] = useState("");
  const [statement, setStatement] = useState("");
  const [expectedTime, setExpectedTime] = useState("");
  const [expectedSpace, setExpectedSpace] = useState("");
  const [examples, setExamples] = useState<Example[]>([]);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const addExample = (): void =>
    setExamples((xs) => [...xs, { input: "", output: "", explanation: "" }]);
  const removeExample = (index: number): void =>
    setExamples((xs) => xs.filter((_, i) => i !== index));
  const updateExample = (index: number, key: keyof Example, value: string): void =>
    setExamples((xs) => xs.map((ex, i) => (i === index ? { ...ex, [key]: value } : ex)));

  const optional = (value: string): string | undefined =>
    value.trim() === "" ? undefined : value.trim();

  const submit = (): void => {
    if (title.trim() === "" || code.trim() === "") {
      setError("Title and code are required.");
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
    onAdd({
      id: crypto.randomUUID(),
      title: title.trim(),
      difficulty,
      tags: tags
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t !== ""),
      url: optional(url),
      origin: "custom",
      statement: optional(statement),
      expectedTime: optional(expectedTime),
      expectedSpace: optional(expectedSpace),
      examples: cleanedExamples.length > 0 ? cleanedExamples : undefined,
      solutions: [
        {
          id: crypto.randomUUID(),
          lang: "python",
          approach: approach.trim() === "" ? "Custom" : approach.trim(),
          code: code.replace(/\r\n/g, "\n").replace(/\s+$/, ""),
        },
      ],
    });
    onClose();
  };

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="flex max-h-full w-full max-w-lg flex-col gap-3 overflow-auto rounded-xl border border-neutral-700 bg-neutral-900 p-6">
        <h2 className="text-lg font-semibold text-neutral-100">Import a solution</h2>

        <Field label="Title">
          <input
            className={inputClass}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Two Sum"
          />
        </Field>

        <div className="flex gap-3">
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
          <Field label="Approach">
            <input
              className={inputClass}
              value={approach}
              onChange={(e) => setApproach(e.target.value)}
              placeholder="Hash map"
            />
          </Field>
        </div>

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

        <Field label="Python solution">
          <textarea
            className={`${inputClass} h-48 resize-none font-mono`}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={"class Solution:\n    ..."}
            spellCheck={false}
          />
        </Field>

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
            onClick={submit}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
          >
            Add
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
