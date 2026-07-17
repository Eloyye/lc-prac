/** Field-level messages returned in the API validation error envelope. */
export type FieldErrors = Record<string, string[]>;

/** Narrow an unknown JSON value to an object with string keys. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

export function isFiniteNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function isNonNegativeInteger(value: unknown): value is number {
  return isFiniteNonNegativeNumber(value) && Number.isInteger(value);
}
