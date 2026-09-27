import { Hono } from "hono";
import type { Context } from "hono";
import type { Db } from "../db/client";
import type { RequestLoggerVariables } from "../middleware/request-logger";
import { requireUser } from "../middleware/session";
import type { AuthVariables } from "../middleware/session";
import {
  archiveCustomProblem,
  createCustomProblem,
  getProblem,
  hideBundledProblem,
  listProblems,
  permanentlyDeleteCustomProblem,
  resetBundledProblem,
  restoreBundledProblem,
  restoreCustomProblem,
  saveProblemOverride,
  updateCustomProblem,
} from "../services/problems";
import type { CustomProblemMutationResult } from "../services/problems";
import { parseProblem, parseProblemListQuery } from "../input/problem";

type RouterVariables = RequestLoggerVariables & AuthVariables;

function mutationError(
  c: Context<{ Variables: RouterVariables }>,
  result: Exclude<CustomProblemMutationResult, { kind: "ok" }>,
) {
  const requestId = c.get("requestId");
  if (result.kind === "conflict") {
    return c.json(
      {
        error: {
          code: "CONFLICT",
          message: "A Problem or Solution id is already in use.",
          requestId,
        },
      },
      409,
    );
  }
  return c.json(
    { error: { code: "NOT_FOUND", message: "Custom Problem not found.", requestId } },
    404,
  );
}

export function createProblemsRouter(db: Db) {
  const router = new Hono<{ Variables: RouterVariables }>();

  router.get("/", (c) => {
    const parsed = parseProblemListQuery(c.req.query());
    if (!parsed.ok) {
      return c.json(
        {
          error: {
            code: "VALIDATION",
            message: "Invalid query parameters.",
            requestId: c.get("requestId"),
            fieldErrors: parsed.fieldErrors,
          },
        },
        400,
      );
    }
    return c.json(listProblems(db, parsed.value, c.var.user?.id));
  });

  router.post("/", requireUser, async (c) => {
    const parsed = parseProblem(await c.req.json().catch(() => null), "custom");
    if (!parsed.ok) {
      return c.json(
        {
          error: {
            code: "VALIDATION",
            message: "Invalid custom Problem.",
            requestId: c.var.requestId,
            fieldErrors: parsed.fieldErrors,
          },
        },
        400,
      );
    }
    const result = createCustomProblem(db, c.var.user!.id, parsed.value);
    return result.kind === "ok" ? c.json(result.problem, 201) : mutationError(c, result);
  });

  router.patch("/:id", requireUser, async (c) => {
    const id = c.req.param("id");
    const existing = getProblem(db, id, c.var.user!.id);
    if (existing === null) {
      return c.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "Problem not found.",
            requestId: c.var.requestId,
          },
        },
        404,
      );
    }
    const body = await c.req.json().catch(() => null);
    const parsed = parseProblem(body, existing.origin, id);
    if (!parsed.ok) {
      return c.json(
        {
          error: {
            code: "VALIDATION",
            message: "Invalid custom Problem.",
            requestId: c.var.requestId,
            fieldErrors: parsed.fieldErrors,
          },
        },
        400,
      );
    }
    if (parsed.value.id !== id) {
      return c.json(
        {
          error: {
            code: "VALIDATION",
            message: "Problem id cannot change.",
            requestId: c.var.requestId,
            fieldErrors: { id: ["Must match the route id."] },
          },
        },
        400,
      );
    }
    if (existing.origin === "bundled") {
      if (!saveProblemOverride(db, c.var.user!.id, parsed.value)) {
        return c.json(
          {
            error: {
              code: "NOT_FOUND",
              message: "Bundled Problem not found.",
              requestId: c.var.requestId,
            },
          },
          404,
        );
      }
      return c.json(parsed.value);
    }
    const result = updateCustomProblem(db, c.var.user!.id, parsed.value.id, parsed.value);
    return result.kind === "ok" ? c.json(result.problem) : mutationError(c, result);
  });

  router.delete("/:id", requireUser, (c) => {
    const problem = getProblem(db, c.req.param("id"), c.var.user!.id);
    if (problem?.origin === "bundled") {
      return hideBundledProblem(db, c.var.user!.id, problem.id)
        ? c.json({ ok: true })
        : mutationError(c, { kind: "not-found" });
    }
    const result = archiveCustomProblem(db, c.var.user!.id, c.req.param("id"));
    return result.kind === "ok" ? c.json(result.problem) : mutationError(c, result);
  });

  router.post("/:id/restore", requireUser, (c) => {
    if (restoreBundledProblem(db, c.var.user!.id, c.req.param("id"))) {
      return c.json({ ok: true });
    }
    const result = restoreCustomProblem(db, c.var.user!.id, c.req.param("id"));
    return result.kind === "ok" ? c.json(result.problem) : mutationError(c, result);
  });

  router.post("/:id/reset", requireUser, (c) => {
    return resetBundledProblem(db, c.var.user!.id, c.req.param("id"))
      ? c.json({ ok: true })
      : mutationError(c, { kind: "not-found" });
  });

  router.delete("/:id/permanent", requireUser, (c) => {
    if (!permanentlyDeleteCustomProblem(db, c.var.user!.id, c.req.param("id"))) {
      return mutationError(c, { kind: "not-found" });
    }
    return c.body(null, 204);
  });

  router.get("/:id", (c) => {
    const problem = getProblem(db, c.req.param("id"), c.var.user?.id);
    if (problem === null) {
      return c.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "Problem not found.",
            requestId: c.get("requestId"),
          },
        },
        404,
      );
    }
    return c.json(problem);
  });

  return router;
}
