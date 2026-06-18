import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { createAuth } from "./auth";
import { openDatabase } from "./db/client";
import { runMigrations } from "./db/migrate";
import { EnvError, parseEnv } from "./env";
import type { Env } from "./env";
import { createLogger } from "./logger";
import { createPyrightLspServer } from "./lsp";

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

const auth = createAuth({
  db,
  baseURL: env.PUBLIC_APP_URL,
  secret: env.BETTER_AUTH_SECRET,
  secureCookies: env.NODE_ENV === "production",
});
const app = createApp({ logger, auth, db, staticRoot });

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  logger.info({ port: info.port, nodeEnv: env.NODE_ENV }, "server listening");
});

const lspServer = createPyrightLspServer({
  logger,
  allowedOrigins: [env.PUBLIC_APP_URL],
  maxConnections: env.LSP_MAX_CONNECTIONS,
  maxConnectionsPerIp: env.LSP_MAX_CONNECTIONS_PER_IP,
  idleTimeoutMs: env.LSP_IDLE_TIMEOUT_MS,
});
lspServer.attach(server);

let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "shutting down");
  try {
    await lspServer.close();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error === undefined ? resolve() : reject(error)));
    });
    closeDatabase();
    process.exit(0);
  } catch (error) {
    logger.error({ err: error }, "server shutdown failed");
    closeDatabase();
    process.exit(1);
  }
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
