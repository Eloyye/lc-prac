/** Every Mode a Session can use, in display order; see `CONTEXT.md`. */
export const MODES = ["copy", "recall", "free"] as const;

/** How a Session reveals the Reference. */
export type Mode = (typeof MODES)[number];

export function isMode(value: unknown): value is Mode {
  return typeof value === "string" && (MODES as readonly string[]).includes(value);
}
