import { randomUUID } from "node:crypto";
import { createMiddleware } from "hono/factory";
import type { Logger } from "pino";

export type RequestLoggerVariables = {
  requestId: string;
};

/**
 * Assigns each request a server-generated id (never trusting a client-supplied
 * one), exposes it on the `x-request-id` response header and in context, and
 * emits exactly one structured log per request on completion or failure.
 *
 * The event carries only identifiers and metrics — method, path, status,
 * duration — never headers, cookies, or bodies, so solution code and
 * credentials cannot leak through request logs.
 */
export function requestLogger(logger: Logger) {
  return createMiddleware<{ Variables: RequestLoggerVariables }>(async (c, next) => {
    const start = performance.now();
    const requestId = randomUUID();
    c.set("requestId", requestId);
    c.header("x-request-id", requestId);

    let caughtError: unknown;
    try {
      await next();
    } catch (error) {
      caughtError = error;
      throw error;
    } finally {
      const durationMs = Math.round(performance.now() - start);
      // When an `onError` handler maps a thrown error to a response, Hono catches
      // it inside `compose` (so `next()` resolves rather than rejecting) and
      // records it on `c.error`. Fall back to a locally caught throw for apps
      // with no error handler. Treat any unhandled throw as a 500 since the
      // response status may not yet reflect it.
      const routeError = caughtError ?? c.error;
      const status = routeError !== undefined && c.res.status < 400 ? 500 : c.res.status;
      const event = {
        requestId,
        method: c.req.method,
        path: new URL(c.req.url).pathname,
        status,
        durationMs,
      };

      if (routeError !== undefined) {
        logger.error({ ...event, err: routeError }, "request failed");
      } else if (status >= 500) {
        logger.error(event, "request failed");
      } else if (status >= 400) {
        logger.warn(event, "request rejected");
      } else {
        logger.info(event, "request completed");
      }
    }
  });
}
