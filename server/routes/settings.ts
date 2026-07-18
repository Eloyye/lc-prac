import { Hono } from "hono";
import type { Mode, Settings } from "../../shared/types";
import type { Db } from "../db/client";
import type { RequestLoggerVariables } from "../middleware/request-logger";
import { requireUser } from "../middleware/session";
import type { AuthVariables } from "../middleware/session";
import { getSettings, replaceSettings } from "../services/settings";
import { isRecord } from "./validation";
import type { FieldErrors } from "./validation";

type RouterVariables = RequestLoggerVariables & AuthVariables;
type ParsedSettings = { ok: true; value: Settings } | { ok: false; fieldErrors: FieldErrors };

const MODES = new Set<Mode>(["copy", "recall", "free"]);
const SETTINGS_FIELDS = new Set(["mode", "distractionFree"]);

function parseSettings(body: unknown): ParsedSettings {
  if (!isRecord(body)) return { ok: false, fieldErrors: { body: ["Must be a JSON object."] } };

  const fieldErrors: FieldErrors = {};
  if (typeof body.mode !== "string" || !MODES.has(body.mode as Mode)) {
    fieldErrors.mode = ["Must be one of copy, recall, free."];
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

export function createSettingsRouter(db: Db) {
  const router = new Hono<{ Variables: RouterVariables }>();

  router.get("/", requireUser, (c) => c.json({ settings: getSettings(db, c.var.user!.id) }));

  router.put("/", requireUser, async (c) => {
    const parsed = parseSettings(await c.req.json().catch(() => null));
    if (!parsed.ok) {
      return c.json(
        {
          error: {
            code: "VALIDATION",
            message: "Invalid Settings.",
            requestId: c.var.requestId,
            fieldErrors: parsed.fieldErrors,
          },
        },
        400,
      );
    }
    return c.json({ settings: replaceSettings(db, c.var.user!.id, parsed.value) });
  });

  return router;
}
