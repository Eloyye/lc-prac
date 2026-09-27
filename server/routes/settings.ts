import { Hono } from "hono";
import type { Db } from "../db/client";
import type { RequestLoggerVariables } from "../middleware/request-logger";
import { requireUser } from "../middleware/session";
import type { AuthVariables } from "../middleware/session";
import { getSettings, replaceSettings } from "../services/settings";
import { parseSettings } from "../input/settings";

type RouterVariables = RequestLoggerVariables & AuthVariables;

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
