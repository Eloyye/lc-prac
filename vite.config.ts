import { defineConfig } from "vitest/config";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { parseEnv } from "./server/env";
import { createLogger } from "./server/logger";
import { createPyrightLspServer } from "./server/lsp";
import type { PyrightLspServer } from "./server/lsp";

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
  plugins: [react(), tailwindcss(), pyrightLsp()],
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
    include: ["src/**/*.test.{ts,tsx}", "server/**/*.test.{ts,tsx}"],
  },
});
