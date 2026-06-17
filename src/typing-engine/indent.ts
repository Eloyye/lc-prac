/** Leading spaces/tabs of a single line. */
export function leadingWhitespace(line: string): string {
  const match = /^[ \t]*/.exec(line);
  return match ? match[0] : "";
}

// A Python compound-statement header: a block keyword whose statement ends in
// `:` (an optional trailing comment is allowed). Anchoring on the keyword AND
// requiring the colon at end-of-statement keeps slices (`nums[i:]`), variable
// annotations (`x: int`), dict entries (`"k": v`), and single-line blocks
// (`if x: foo()`) from being mistaken for block openers.
const BLOCK_HEADER =
  /^[ \t]*(?:async[ \t]+def|async[ \t]+for|async[ \t]+with|def|class|for|while|if|elif|else|try|except|finally|with|match|case)\b.*:[ \t]*(?:#.*)?$/;

/** Whether `line` opens an indented block — i.e. its body should indent one level. */
export function opensBlock(line: string): boolean {
  return BLOCK_HEADER.test(line);
}

/**
 * VSCode-style indentation for the line created when Enter is pressed after
 * `currentLine`. The new line inherits `currentLine`'s own leading whitespace,
 * plus one `indentUnit` when `currentLine` opens a block. This mirrors what
 * VSCode does for Python — stay at the current level, and step in after a
 * block header — instead of copying the reference's indentation.
 */
export function enterIndent(currentLine: string, indentUnit: string): string {
  const base = leadingWhitespace(currentLine);
  return opensBlock(currentLine) ? base + indentUnit : base;
}
