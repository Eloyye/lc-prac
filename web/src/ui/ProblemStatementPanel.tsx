import type { Problem } from "@shared/domain/problem";
import { Markdown } from "./Markdown";

type ProblemStatementPanelProps = Pick<Problem, "statement" | "url">;

export function ProblemStatementPanel({ statement, url }: ProblemStatementPanelProps) {
  const hasStatement = statement !== undefined && statement.trim() !== "";

  if (!hasStatement && url === undefined) return null;

  return (
    <details className="group shrink-0 border-b-2 border-cobalt-700 bg-cobalt-850">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-2 text-xs font-semibold text-cobalt-200 hover:bg-cobalt-800 hover:text-paper [&::-webkit-details-marker]:hidden">
        <span>Problem statement</span>
        <span className="text-cobalt-400">
          <span className="group-open:hidden">Show</span>
          <span className="hidden group-open:inline">Hide</span>
        </span>
      </summary>
      <div className="max-h-64 overflow-y-auto border-t-2 border-cobalt-700 px-4 py-3">
        {hasStatement ? (
          <Markdown source={statement} />
        ) : (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-semibold text-pink hover:text-pink-light"
          >
            View problem statement at source ↗
          </a>
        )}
      </div>
    </details>
  );
}
