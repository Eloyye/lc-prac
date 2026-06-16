import { defineConfig } from "vitest/config";
import type { Plugin } from "vite";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { WebSocketServer } from "ws";
import { createServerProcess, createWebSocketConnection, forward } from "vscode-ws-jsonrpc/server";

// Runs pyright (node) as a WebSocket LSP server attached to Vite's own dev
// server at the `/lsp` path. It shares whatever port Vite picks (which Vite
// auto-increments if taken) — so there's no dedicated port to conflict, and
// the browser connects same-origin. Dev-only (no LSP in `vite preview`/build).
function pyrightLsp(): Plugin {
  const langserver = fileURLToPath(
    new URL("./node_modules/.bin/pyright-langserver", import.meta.url),
  );
  return {
    name: "pyright-lsp",
    configureServer(server) {
      const wss = new WebSocketServer({ noServer: true });
      server.httpServer?.on("upgrade", (request: IncomingMessage, socket: Duplex, head: Buffer) => {
        // Only handle /lsp; let Vite's HMR socket handle everything else.
        if (new URL(request.url ?? "", "http://localhost").pathname !== "/lsp") {
          return;
        }
        wss.handleUpgrade(request, socket, head, (webSocket) => {
          const ioSocket = {
            send: (content: string) => webSocket.send(content),
            onMessage: (cb: (data: string) => void) =>
              webSocket.on("message", (data) => cb(data.toString())),
            onError: (cb: (error: unknown) => void) => webSocket.on("error", cb),
            onClose: (cb: (code: number, reason: string) => void) =>
              webSocket.on("close", (code, reason) => cb(code, reason.toString())),
            dispose: () => webSocket.close(),
          };
          const clientConnection = createWebSocketConnection(ioSocket);
          const serverConnection = createServerProcess("pyright", langserver, ["--stdio"]);
          if (serverConnection === undefined) {
            webSocket.close();
            return;
          }
          forward(clientConnection, serverConnection);
          webSocket.on("close", () => serverConnection.dispose());
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), pyrightLsp()],
  server: { port: process.env.PORT ? Number(process.env.PORT) : undefined },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
