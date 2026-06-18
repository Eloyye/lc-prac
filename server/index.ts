import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { openDatabase } from "./db/client";
import { runMigrations } from "./db/migrate";
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

// Open the database and bring its schema up to date before serving. Migrations
// are idempotent, so this is safe on every boot; a failure here aborts startup
// rather than serving requests against a half-formed schema.
const { db, close: closeDatabase } = openDatabase(env.DB_FILE_NAME);
try {
  runMigrations(db);
} catch (error) {
  logger.fatal({ err: error, dbFileName: env.DB_FILE_NAME }, "database migration failed");
  closeDatabase();
  process.exit(1);
}

// The built SPA lives in <repo>/dist (Vite's default outDir); this entrypoint
// runs from <repo>/server.
const staticRoot = fileURLToPath(new URL("../dist", import.meta.url));

const app = createApp({ logger, db, staticRoot });

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  logger.info({ port: info.port, nodeEnv: env.NODE_ENV }, "server listening");
});

function shutdown(signal: NodeJS.Signals): void {
  logger.info({ signal }, "shutting down");
  server.close(() => {
    closeDatabase();
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
