import type { Problem } from "../types";
import { Markdown } from "./Markdown";

type ProblemStatementPanelProps = Pick<Problem, "statement" | "url">;

export function ProblemStatementPanel({ statement, url }: ProblemStatementPanelProps) {
  const hasStatement = statement !== undefined && statement.trim() !== "";

  if (!hasStatement && url === undefined) return null;

  return (
    <details className="group shrink-0 border-b border-neutral-800 bg-neutral-950">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-2 text-xs uppercase tracking-wide text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200 [&::-webkit-details-marker]:hidden">
        <span>Problem statement</span>
        <span className="normal-case tracking-normal text-neutral-500">
          <span className="group-open:hidden">Show</span>
          <span className="hidden group-open:inline">Hide</span>
        </span>
      </summary>
      <div className="max-h-64 overflow-y-auto border-t border-neutral-800 px-4 py-3">
        {hasStatement ? (
          <Markdown source={statement} />
        ) : (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-emerald-400 hover:text-emerald-300"
          >
            View problem statement at source ↗
          </a>
        )}
      </div>
    </details>
  );
}
