import type { LocalDataImportSkippedRecord } from "../../shared/api/local-data-import";
import type { ValidatedLocalDataImport } from "../services/local-data-import";
import { parseImportedAttempt } from "./attempt";
import { parseProblem } from "./problem";
import { parseImportedSettings } from "./settings";
import { isNonEmptyString, isRecord } from "./validation";
import type { FieldErrors } from "../../shared/api/errors";

export type ParsedLocalDataImportRequest =
  | { ok: true; action: "skip"; idempotencyToken: string }
  | {
      ok: true;
      action: "import";
      idempotencyToken: string;
      data: ValidatedLocalDataImport;
    }
  | { ok: false; fieldErrors: FieldErrors };

function recordId(value: unknown, index: number): string {
  return isRecord(value) && isNonEmptyString(value.id) ? value.id.trim() : `#${index + 1}`;
}

function invalidRecord(
  collection: LocalDataImportSkippedRecord["collection"],
  id: string,
): LocalDataImportSkippedRecord {
  return { collection, id, reason: "invalid" };
}

/** Parse a local-data Import decision; invalid records are skipped, not rejected. */
export function parseLocalDataImportRequest(body: unknown): ParsedLocalDataImportRequest {
  if (!isRecord(body)) return { ok: false, fieldErrors: { body: ["Must be a JSON object."] } };
  const fieldErrors: FieldErrors = {};
  if (!isNonEmptyString(body.idempotencyToken) || body.idempotencyToken.length > 200) {
    fieldErrors.idempotencyToken = ["A token of at most 200 characters is required."];
  }
  if (body.action !== "import" && body.action !== "skip") {
    fieldErrors.action = ["Must be import or skip."];
  }
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
  const idempotencyToken = (body.idempotencyToken as string).trim();
  if (body.action === "skip") return { ok: true, action: "skip", idempotencyToken };

  for (const field of ["customProblems", "overrides", "tombstones", "attempts"] as const) {
    if (!Array.isArray(body[field])) fieldErrors[field] = ["Must be an array."];
  }
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };

  const skipped: LocalDataImportSkippedRecord[] = [];
  const customProblems = (body.customProblems as unknown[]).flatMap((candidate, index) => {
    const parsed = parseProblem(candidate, "custom");
    if (parsed.ok) return [parsed.value];
    skipped.push(invalidRecord("customProblems", recordId(candidate, index)));
    return [];
  });
  const overrides = (body.overrides as unknown[]).flatMap((candidate, index) => {
    const parsed = parseProblem(candidate, "bundled");
    if (parsed.ok) return [parsed.value];
    skipped.push(invalidRecord("overrides", recordId(candidate, index)));
    return [];
  });
  const tombstones = (body.tombstones as unknown[]).flatMap((candidate, index) => {
    if (isNonEmptyString(candidate)) return [candidate.trim()];
    skipped.push(invalidRecord("tombstones", `#${index + 1}`));
    return [];
  });
  const attempts = (body.attempts as unknown[]).flatMap((candidate, index) => {
    const parsed = parseImportedAttempt(candidate);
    if (parsed.ok) return [parsed.value];
    skipped.push(invalidRecord("attempts", recordId(candidate, index)));
    return [];
  });

  const settings =
    body.settings === undefined ? { ok: true as const } : parseImportedSettings(body.settings);
  if (!settings.ok) skipped.push(invalidRecord("settings", "current"));

  return {
    ok: true,
    action: "import",
    idempotencyToken,
    data: {
      customProblems,
      overrides,
      tombstones,
      attempts,
      ...(settings.ok && settings.value !== undefined ? { settings: settings.value } : {}),
      skipped,
    },
  };
}
