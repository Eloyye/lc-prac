import { Hono } from "hono";
import type { Logger } from "pino";
import type { Auth } from "./auth";
import type { Db } from "./db/client";
import { requestLogger } from "./middleware/request-logger";
import type { RequestLoggerVariables } from "./middleware/request-logger";
import { sessionContext } from "./middleware/session";
import type { AuthVariables } from "./middleware/session";
import { health } from "./routes/health";
import { me } from "./routes/me";
import { createAttemptsRouter } from "./routes/attempts";
import { createProblemsRouter } from "./routes/problems";
import { createStatsRouter } from "./routes/stats";
import { createStaticSpa } from "./static";

export type AppVariables = RequestLoggerVariables & AuthVariables;

export type CreateAppOptions = {
  logger: Logger;
  auth?: Auth;
  /**
   * Drizzle database for the Problem Library API. When provided, the
   * `/api/problems` routes are mounted. Tests pass a migrated temporary
   * database; omit it for a problems-free app (e.g. the health-only foundation).
   */
  db?: Db;
  /**
   * Absolute path to the built SPA (Vite `dist`). When provided, unmatched
   * non-API GETs are served the app shell. Omitted in tests and in development
   * (where Vite serves the client).
   */
  staticRoot?: string;
};

/**
 * Compose the application server: one structured log per request, the `/api`
 * surface, optional static + SPA serving, and consistent JSON error envelopes
 * that always carry the request id.
 */
export function createApp(options: CreateAppOptions) {
  const app = new Hono<{ Variables: AppVariables }>();

  // Must be first so every request — matched, 404, or errored — is logged and
  // assigned a request id before any other handler runs.
  app.use("*", requestLogger(options.logger));
  app.use("*", sessionContext(options.auth));

  const auth = options.auth;
  if (auth !== undefined) {
    app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));
  }

  app.route("/api", health);
  app.route("/api/me", me);
  if (options.db !== undefined) {
    app.route("/api/attempts", createAttemptsRouter(options.db));
    app.route("/api/problems", createProblemsRouter(options.db));
    app.route("/api/stats", createStatsRouter(options.db));
  }

  // Static + SPA fallback runs last among matchers: API routes above win, and
  // the handler itself defers API paths and non-GET methods to the 404 handler.
  if (options.staticRoot !== undefined) {
    app.on(["GET", "HEAD"], "*", createStaticSpa(options.staticRoot));
  }

  app.notFound((c) => {
    const requestId = c.get("requestId");
    c.header("x-request-id", requestId);
    return c.json({ error: { code: "NOT_FOUND", message: "Not found.", requestId } }, 404);
  });

  app.onError((_error, c) => {
    const requestId = c.get("requestId");
    c.header("x-request-id", requestId);
    // The request logger records the error with full detail; the client gets a
    // generic message so internals never leak in the response body.
    return c.json(
      { error: { code: "INTERNAL", message: "Internal server error.", requestId } },
      500,
    );
  });

  return app;
}
