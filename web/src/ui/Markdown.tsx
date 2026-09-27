import DOMPurify from "dompurify";
import { Marked } from "marked";

// A private Marked instance so we never mutate the global `marked` config that
// monaco-editor (a transitive marked consumer) also imports. `parse(..., {
// async: false })` is the overload that returns a plain string synchronously.
const md = new Marked();

// Utility-first prose styling for the dark theme. There is no typography plugin,
// so element styles are applied with arbitrary descendant variants on the
// container — verbose, but keeps everything in Tailwind and avoids a global CSS
// stylesheet. Shared by the detail page and (later, #9) the Session panel.
const PROSE = [
  "text-sm leading-relaxed text-cobalt-200",
  "[&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0",
  "[&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:text-lg [&_h1]:font-semibold [&_h1]:text-paper",
  "[&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-paper",
  "[&_h3]:mt-3 [&_h3]:mb-1 [&_h3]:font-semibold [&_h3]:text-paper",
  "[&_strong]:font-semibold [&_strong]:text-paper",
  "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1",
  "[&_a]:text-pink [&_a]:underline hover:[&_a]:text-pink-light",
  "[&_code]:rounded [&_code]:bg-cobalt-700 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em] [&_code]:text-paper",
  "[&_pre]:my-3 [&_pre]:overflow-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-cobalt-700 [&_pre]:bg-cobalt-950 [&_pre]:p-3",
  "[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-[0.85em]",
  "[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-cobalt-600 [&_blockquote]:pl-3 [&_blockquote]:text-cobalt-300",
  "[&_hr]:my-4 [&_hr]:border-cobalt-700",
].join(" ");

/**
 * Renders a markdown string as sanitized HTML. DOMPurify is the security
 * boundary: it strips scripts, event-handler attributes, and dangerous URI
 * schemes (e.g. `javascript:`) from the marked output before it reaches the DOM.
 */
export function Markdown({ source, className = "" }: { source: string; className?: string }) {
  const html = DOMPurify.sanitize(md.parse(source, { async: false }));
  return (
    <div
      className={`${PROSE} ${className}`.trim()}
      // Safe: `html` is DOMPurify-sanitized immediately above.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
