import { Hono } from "hono";
import type { Logger } from "pino";
import { requestLogger } from "./middleware/request-logger";
import type { RequestLoggerVariables } from "./middleware/request-logger";
import { health } from "./routes/health";
import { createStaticSpa } from "./static";

export type AppVariables = RequestLoggerVariables;

export type CreateAppOptions = {
  logger: Logger;
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

  app.route("/api", health);

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
