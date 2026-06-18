import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { EnvError, parseEnv } from "./env";
import type { Env } from "./env";
import { createLogger } from "./logger";

function loadEnv(): Env {
  try {
    return parseEnv(process.env);
  } catch (error) {
    // Configuration problems should fail fast with an actionable message and no
    // stack-trace noise; anything else is unexpected and printed in full.
    if (error instanceof EnvError) {
      console.error(error.message);
    } else {
      console.error(error);
    }
    process.exit(1);
  }
}

const env = loadEnv();
const logger = createLogger(env);

// The built SPA lives in <repo>/dist (Vite's default outDir); this entrypoint
// runs from <repo>/server.
const staticRoot = fileURLToPath(new URL("../dist", import.meta.url));

const app = createApp({ logger, staticRoot });

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  logger.info({ port: info.port, nodeEnv: env.NODE_ENV }, "server listening");
});

function shutdown(signal: NodeJS.Signals): void {
  logger.info({ signal }, "shutting down");
  server.close(() => process.exit(0));
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
