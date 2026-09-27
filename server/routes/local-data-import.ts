import { Hono } from "hono";
import type { Db } from "../db/client";
import type { RequestLoggerVariables } from "../middleware/request-logger";
import { requireUser } from "../middleware/session";
import type { AuthVariables } from "../middleware/session";
import {
  getLocalDataImportStatus,
  importLocalData,
  skipLocalDataImport,
} from "../services/local-data-import";
import { parseLocalDataImportRequest } from "../input/local-data-import";

type RouterVariables = RequestLoggerVariables & AuthVariables;
export function createLocalDataImportRouter(db: Db) {
  const router = new Hono<{ Variables: RouterVariables }>();

  router.get("/", requireUser, (c) => c.json(getLocalDataImportStatus(db, c.var.user!.id)));

  router.post("/", requireUser, async (c) => {
    const parsed = parseLocalDataImportRequest(await c.req.json().catch(() => null));
    if (!parsed.ok) {
      return c.json(
        {
          error: {
            code: "VALIDATION",
            message: "Invalid local data Import.",
            requestId: c.var.requestId,
            fieldErrors: parsed.fieldErrors,
          },
        },
        400,
      );
    }

    const result =
      parsed.action === "skip"
        ? skipLocalDataImport(db, c.var.user!.id, parsed.idempotencyToken)
        : importLocalData(db, c.var.user!.id, parsed.idempotencyToken, parsed.data);
    if (result.kind === "already-decided") {
      return c.json(
        {
          error: {
            code: "CONFLICT",
            message: "A local data Import decision is already recorded.",
            requestId: c.var.requestId,
          },
        },
        409,
      );
    }
    return c.json(
      { report: result.report, replayed: result.replayed },
      result.replayed ? 200 : 201,
    );
  });

  return router;
}
