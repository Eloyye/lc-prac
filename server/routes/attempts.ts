import { Hono } from "hono";
import type { Db } from "../db/client";
import type { RequestLoggerVariables } from "../middleware/request-logger";
import { requireUser } from "../middleware/session";
import type { AuthVariables } from "../middleware/session";
import { createAttempt, listAttempts } from "../services/attempts";
import { parseAttempt } from "../input/attempt";
import { parseHistoryQuery } from "../input/history";

type RouterVariables = RequestLoggerVariables & AuthVariables;

export function createAttemptsRouter(db: Db) {
  const router = new Hono<{ Variables: RouterVariables }>();

  router.get("/", requireUser, (c) => {
    const parsed = parseHistoryQuery(c.req.query(), { allowLimit: true });
    if (!parsed.ok) {
      return c.json(
        {
          error: {
            code: "VALIDATION",
            message: "Invalid history filters.",
            requestId: c.var.requestId,
            fieldErrors: parsed.fieldErrors,
          },
        },
        400,
      );
    }
    return c.json({
      attempts: listAttempts(db, c.var.user!.id, parsed.filters, parsed.limit),
    });
  });

  router.post("/", requireUser, async (c) => {
    const parsed = parseAttempt(await c.req.json().catch(() => null));
    if (!parsed.ok) {
      return c.json(
        {
          error: {
            code: "VALIDATION",
            message: "Invalid Attempt.",
            requestId: c.var.requestId,
            fieldErrors: parsed.fieldErrors,
          },
        },
        400,
      );
    }

    const result = createAttempt(db, c.var.user!.id, parsed.value);
    if (result.kind === "not-found") {
      return c.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "Problem or Solution not found.",
            requestId: c.var.requestId,
          },
        },
        404,
      );
    }
    if (result.kind === "conflict") {
      return c.json(
        {
          error: {
            code: "CONFLICT",
            message: "Attempt id is already in use.",
            requestId: c.var.requestId,
          },
        },
        409,
      );
    }

    const { created, kind: _kind, ...response } = result;
    return c.json(response, created ? 201 : 200);
  });

  return router;
}
