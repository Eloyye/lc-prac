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
  server: { port: process.env.PORT ? Number(process.env.PORT) : undefined },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "server/**/*.test.ts"],
  },
});
