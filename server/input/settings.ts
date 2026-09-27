import type { LocalSettingsImport } from "../../shared/api/local-data-import";
import { isMode, MODES } from "../../shared/domain/mode";
import type { Mode } from "../../shared/domain/mode";
import type { Settings } from "../../shared/domain/settings";
import { isRecord } from "./validation";
import type { FieldErrors, Parsed } from "./validation";

const SETTINGS_FIELDS = new Set(["mode", "distractionFree"]);

/** Parse a complete `PUT /settings` replacement; unknown keys are rejected. */
export function parseSettings(body: unknown): Parsed<Settings> {
  if (!isRecord(body)) return { ok: false, fieldErrors: { body: ["Must be a JSON object."] } };

  const fieldErrors: FieldErrors = {};
  if (!isMode(body.mode)) {
    fieldErrors.mode = [`Must be one of ${MODES.join(", ")}.`];
  }
  if (typeof body.distractionFree !== "boolean") {
    fieldErrors.distractionFree = ["Must be a boolean."];
  }
  for (const field of Object.keys(body)) {
    if (!SETTINGS_FIELDS.has(field)) fieldErrors[field] = ["Is not a synchronized Setting."];
  }

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
  return {
    ok: true,
    value: { mode: body.mode as Mode, distractionFree: body.distractionFree as boolean },
  };
}

/**
 * Parse browser-local Settings for the one-time local-data Import. Every field
 * is optional and unsupported legacy keys (theme, smoothCaret, UI state) are
 * ignored; `value` is omitted when nothing synchronizable remains.
 */
export function parseImportedSettings(
  value: unknown,
): { ok: true; value?: LocalSettingsImport } | { ok: false } {
  if (!isRecord(value)) return { ok: false };
  const settings: LocalSettingsImport = {};
  if (value.mode !== undefined) {
    if (!isMode(value.mode)) return { ok: false };
    settings.mode = value.mode;
  }
  if (value.distractionFree !== undefined) {
    if (typeof value.distractionFree !== "boolean") return { ok: false };
    settings.distractionFree = value.distractionFree;
  }
  return Object.keys(settings).length === 0 ? { ok: true } : { ok: true, value: settings };
}
