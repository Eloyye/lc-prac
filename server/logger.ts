import { pino, stdSerializers } from "pino";
import type { Logger, LoggerOptions } from "pino";
import type { Env } from "./env";

export type { Logger };

/**
 * Base Pino options shared by the real logger and tests. Redaction is the last
 * line of defence: the request logger already logs only identifiers and
 * metrics, but these paths guarantee credentials and solution code never reach
 * a log sink even if a future call site passes a richer object.
 */
export function loggerOptions(env: Env): LoggerOptions {
  return {
    level: env.LOG_LEVEL,
    serializers: { err: stdSerializers.err },
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "req.headers.set-cookie",
        "req.body",
        "request.headers.authorization",
        "request.headers.cookie",
        "request.headers.set-cookie",
        "request.body",
        "headers.authorization",
        "headers.cookie",
        "headers.set-cookie",
        "body",
        "password",
        "token",
        "accessToken",
        "refreshToken",
        "sessionToken",
        "code",
        "solution.code",
      ],
      remove: true,
    },
  };
}

/**
 * The root application logger. Structured JSON in production; a human-readable
 * pretty stream in development. `pino-pretty` is a dev-only dependency and is
 * never required outside the development transport.
 */
export function createLogger(env: Env): Logger {
  const options = loggerOptions(env);
  if (env.NODE_ENV === "development") {
    return pino({
      ...options,
      transport: {
        target: "pino-pretty",
        options: { colorize: true, translateTime: "SYS:standard", singleLine: true },
      },
    });
  }
  return pino(options);
}
