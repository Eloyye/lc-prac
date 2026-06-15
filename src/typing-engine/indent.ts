/** Leading spaces/tabs of a single line. */
export function leadingWhitespace(line: string): string {
  const match = /^[ \t]*/.exec(line);
  return match ? match[0] : "";
}

/** Expected indentation for the 0-based `lineIndex` of `target`. */
export function expectedIndent(target: string, lineIndex: number): string {
  const line = target.split("\n")[lineIndex];
  return line === undefined ? "" : leadingWhitespace(line);
}
