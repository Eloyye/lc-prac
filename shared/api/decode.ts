/**
 * Minimal response decoders for the endpoint contracts in `shared/api/*`. A
 * decoder checks an untrusted JSON value against a contract and returns that
 * same value typed, or throws `DecodeError` naming the first mismatch. The
 * browser transport applies them to every 2xx body; server tests apply them to
 * real responses so both sides are held to one definition.
 */

/** A JSON value that does not match its endpoint contract. */
export class DecodeError extends Error {
  /** Dotted path to the mismatch, e.g. `problems[0].solutions[1].code`. */
  readonly path: string;

  constructor(path: string, expected: string) {
    super(`${path === "" ? "response" : path}: expected ${expected}.`);
    this.name = "DecodeError";
    this.path = path;
  }
}

export type Decoder<T> = (value: unknown, path?: string) => T;

function fail(path: string, expected: string): never {
  throw new DecodeError(path, expected);
}

function child(path: string, key: string | number): string {
  if (typeof key === "number") return `${path}[${key}]`;
  return path === "" ? key : `${path}.${key}`;
}

export const string: Decoder<string> = (value, path = "") =>
  typeof value === "string" ? value : fail(path, "a string");

export const number: Decoder<number> = (value, path = "") =>
  typeof value === "number" && Number.isFinite(value) ? value : fail(path, "a finite number");

export const boolean: Decoder<boolean> = (value, path = "") =>
  typeof value === "boolean" ? value : fail(path, "a boolean");

/** Accept any JSON value, for deliberately opaque fields such as `errorMap`. */
export const unknownValue: Decoder<unknown> = (value) => value;

/** The empty body of a 204 response. */
export const noContent: Decoder<void> = (value, path = "") =>
  value === undefined ? undefined : fail(path, "no content");

export function literal<const T extends string | boolean>(...values: T[]): Decoder<T> {
  return (value, path = "") =>
    values.includes(value as T) ? (value as T) : fail(path, `one of ${values.join(", ")}`);
}

/** Lift an existing type guard, such as `isMode`, into a decoder. */
export function guarded<T>(is: (value: unknown) => value is T, expected: string): Decoder<T> {
  return (value, path = "") => (is(value) ? value : fail(path, expected));
}

export function nullable<T>(decode: Decoder<T>): Decoder<T | null> {
  return (value, path = "") => (value === null ? null : decode(value, path));
}

export function array<T>(item: Decoder<T>): Decoder<T[]> {
  return (value, path = "") => {
    if (!Array.isArray(value)) return fail(path, "an array");
    value.forEach((entry, index) => item(entry, child(path, index)));
    return value as T[];
  };
}

type Fields<T> = { [K in keyof T]-?: Decoder<T[K]> };

/**
 * Check an object's required fields and, when present, its optional ones.
 * Unlisted keys are allowed and passed through untouched.
 */
export function object<R extends object, O extends object = Record<never, never>>(
  required: Fields<R>,
  optional?: Fields<O>,
): Decoder<NoInfer<R> & Partial<NoInfer<O>>> {
  return (value, path = "") => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return fail(path, "an object");
    }
    const record = value as Record<string, unknown>;
    for (const [key, decode] of Object.entries(required) as [string, Decoder<unknown>][]) {
      decode(record[key], child(path, key));
    }
    for (const [key, decode] of Object.entries(optional ?? {}) as [string, Decoder<unknown>][]) {
      if (record[key] !== undefined) decode(record[key], child(path, key));
    }
    return value as R & Partial<O>;
  };
}
