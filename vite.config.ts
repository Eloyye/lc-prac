import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { parseEnv } from "./server/env";
import { createLogger } from "./server/logger";
import { createPyrightLspServer } from "./server/lsp";
import type { PyrightLspServer } from "./server/lsp";

// This config lives at the repo root (not in web/) because it doubles as the
// single Vitest config for the whole repo and it imports the pyright LSP from
// server/. `root` points Vite at the web/ app; test globs and the build output
// are pinned to absolute repo paths so they're independent of Vite's `root`.
const repoRoot = fileURLToPath(new URL(".", import.meta.url));

function pyrightLsp(): Plugin {
  let lspServer: PyrightLspServer | undefined;
  return {
    name: "pyright-lsp",
    configureServer(server) {
      if (server.httpServer === null) return;
      const env = parseEnv({ ...process.env, NODE_ENV: "development" });
      lspServer = createPyrightLspServer({
        logger: createLogger(env),
        maxConnections: env.LSP_MAX_CONNECTIONS,
        maxConnectionsPerIp: env.LSP_MAX_CONNECTIONS_PER_IP,
        idleTimeoutMs: env.LSP_IDLE_TIMEOUT_MS,
      });
      lspServer.attach(server.httpServer);
    },
    async closeBundle() {
      const activeServer = lspServer;
      lspServer = undefined;
      await activeServer?.close();
    },
  };
}

export default defineConfig({
  // The Vite app/build is rooted at web/. Under Vitest we keep the repo root so
  // node_modules (notably the native better-sqlite3 addon used by server tests)
  // is externalized rather than transformed.
  root: process.env.VITEST ? undefined : "web",
  plugins: [react(), tailwindcss(), pyrightLsp()],
  resolve: {
    alias: { "@shared": fileURLToPath(new URL("./shared", import.meta.url)) },
  },
  build: {
    // Keep the build at repo-root dist/ so the Hono server's `../dist` static
    // root (server/index.ts) keeps working without changes.
    outDir: fileURLToPath(new URL("./dist", import.meta.url)),
    emptyOutDir: true,
  },
  server: {
    port: process.env.PORT ? Number(process.env.PORT) : undefined,
    // In development the client runs under Vite while the API runs under Hono
    // (`pnpm dev:server`, default port 3000). Proxy `/api/*` there so the browser
    // makes same-origin requests, matching the production monolith. `/lsp` is
    // handled separately by the pyright plugin's upgrade handler above.
    proxy: { "/api": { target: "http://localhost:3000", changeOrigin: true } },
  },
  test: {
    environment: "node",
    include: [
      `${repoRoot}web/src/**/*.test.{ts,tsx}`,
      `${repoRoot}server/**/*.test.{ts,tsx}`,
      `${repoRoot}shared/**/*.test.{ts,tsx}`,
    ],
  },
});
