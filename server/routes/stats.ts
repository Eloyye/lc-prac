import { Hono } from "hono";
import type { Db } from "../db/client";
import type { RequestLoggerVariables } from "../middleware/request-logger";
import { requireUser } from "../middleware/session";
import type { AuthVariables } from "../middleware/session";
import { getStatsSummary, listBestScores } from "../services/stats";
import { parseHistoryQuery } from "./history-query";

type RouterVariables = RequestLoggerVariables & AuthVariables;

export function createStatsRouter(db: Db) {
  const router = new Hono<{ Variables: RouterVariables }>();

  const parse = (query: Record<string, string>) => parseHistoryQuery(query);

  router.get("/summary", requireUser, (c) => {
    const parsed = parse(c.req.query());
    if (!parsed.ok) {
      return c.json(
        {
          error: {
            code: "VALIDATION",
            message: "Invalid summary filters.",
            requestId: c.var.requestId,
            fieldErrors: parsed.fieldErrors,
          },
        },
        400,
      );
    }
    return c.json(getStatsSummary(db, c.var.user!.id, parsed.filters));
  });

  router.get("/best-scores", requireUser, (c) => {
    const parsed = parse(c.req.query());
    if (!parsed.ok) {
      return c.json(
        {
          error: {
            code: "VALIDATION",
            message: "Invalid Personal Best filters.",
            requestId: c.var.requestId,
            fieldErrors: parsed.fieldErrors,
          },
        },
        400,
      );
    }
    return c.json({ bestScores: listBestScores(db, c.var.user!.id, parsed.filters) });
  });

  return router;
}
