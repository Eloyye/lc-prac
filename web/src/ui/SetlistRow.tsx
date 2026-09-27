import type { ReactNode } from "react";
import type { Problem } from "@shared/domain/problem";
import { DIFFICULTY_COLOR, DIFFICULTY_FILL, DIFFICULTY_HOVER } from "./difficulty";

interface SetlistRowProps {
  problem: Problem;
  /** The title content — a stretched Link for active rows, plain text otherwise. */
  title: ReactNode;
  /** Extra trailing meta after the tags (e.g. approach count). */
  meta?: string;
  /** Right-hand column: score or row actions. */
  aside: ReactNode;
}

/**
 * The Library's list row: a difficulty-colored stripe, a big condensed title,
 * tags underneath, and a right-aligned score/action column. The row washes in
 * its difficulty color on hover or keyboard focus.
 */
export function SetlistRow({ problem, title, meta, aside }: SetlistRowProps) {
  return (
    <li
      className={`relative grid grid-cols-[8px_minmax(0,1fr)_auto] items-stretch gap-4 border-t border-cobalt-700 transition-colors duration-100 ${DIFFICULTY_HOVER[problem.difficulty]}`}
    >
      <div className={DIFFICULTY_FILL[problem.difficulty]} aria-hidden="true" />
      <div className="py-3.5">
        <h3 className="font-display text-2xl leading-tight font-extrabold text-paper sm:text-3xl">
          {title}
        </h3>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-cobalt-300">
          <span className={`font-semibold capitalize ${DIFFICULTY_COLOR[problem.difficulty]}`}>
            {problem.difficulty}
          </span>
          {problem.origin === "custom" && (
            <span className="rounded-full bg-cobalt-700 px-2 py-0.5 font-medium text-cobalt-200">
              Custom
            </span>
          )}
          {problem.tags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
          {meta !== undefined && <span className="text-cobalt-400">{meta}</span>}
        </div>
      </div>
      <div className="flex items-center gap-3 py-3 pr-4">{aside}</div>
    </li>
  );
}
