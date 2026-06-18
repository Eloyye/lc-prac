import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { pino } from "pino";
import type { Logger } from "pino";
import { WebSocket } from "ws";
import { describe, expect, it, vi } from "vitest";
import { createPyrightLspServer } from "./lsp";
import type {
  LspProcessFailure,
  LspSessionHandle,
  LspSessionLauncher,
  PyrightLspServer,
  PyrightLspServerOptions,
} from "./lsp";

const ALLOWED_ORIGIN = "http://codetype.test";

type Harness = {
  url: string;
  server: ReturnType<typeof createServer>;
  lspServer: PyrightLspServer;
  handles: LspSessionHandle[];
  failures: Array<(failure: LspProcessFailure) => void>;
  logs: () => string;
};

function captureLogger(): { logger: Logger; output: () => string } {
  const lines: string[] = [];
  const logger = pino(
    { level: "trace", base: undefined },
    {
      write(chunk: string) {
        lines.push(chunk);
      },
    },
  );
  return { logger, output: () => lines.join("") };
}

async function createHarness(overrides: Partial<PyrightLspServerOptions> = {}): Promise<Harness> {
  const { logger, output } = captureLogger();
  const handles: LspSessionHandle[] = [];
  const failures: Array<(failure: LspProcessFailure) => void> = [];
  const launchSession: LspSessionLauncher = (_webSocket, onFailure) => {
    const handle = { dispose: vi.fn(), closed: Promise.resolve() };
    handles.push(handle);
    failures.push(onFailure);
    return handle;
  };
  const server = createServer();
  const lspServer = createPyrightLspServer({
    logger,
    allowedOrigins: [ALLOWED_ORIGIN],
    maxConnections: 4,
    maxConnectionsPerIp: 4,
    idleTimeoutMs: 10_000,
    launchSession,
    ...overrides,
  });
  lspServer.attach(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return {
    url: `ws://127.0.0.1:${address.port}/lsp`,
    server,
    lspServer,
    handles,
    failures,
    logs: output,
  };
}

async function closeHarness(harness: Harness): Promise<void> {
  await harness.lspServer.close();
  await new Promise<void>((resolve, reject) => {
    harness.server.close((error) => (error === undefined ? resolve() : reject(error)));
  });
}

function connect(url: string, origin = ALLOWED_ORIGIN): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const webSocket = new WebSocket(url, { origin });
    webSocket.once("open", () => resolve(webSocket));
    webSocket.once("error", reject);
  });
}

function rejectionStatus(url: string, origin?: string): Promise<number | undefined> {
  return new Promise((resolve, reject) => {
    const webSocket = new WebSocket(url, origin === undefined ? {} : { origin });
    const timeout = setTimeout(() => reject(new Error("Upgrade was not rejected.")), 1000);
    webSocket.on("error", () => {});
    webSocket.once("unexpected-response", (_request, response) => {
      clearTimeout(timeout);
      response.resume();
      resolve(response.statusCode);
    });
  });
}

async function waitForClose(webSocket: WebSocket): Promise<number> {
  return new Promise((resolve) => webSocket.once("close", resolve));
}

describe("Pyright LSP WebSocket server", () => {
  it.each([
    ["a missing Origin", undefined],
    ["a foreign Origin", "https://attacker.example"],
  ])("rejects %s before launching Pyright", async (_label, origin) => {
    const harness = await createHarness();
    try {
      expect(await rejectionStatus(harness.url, origin)).toBe(403);
      expect(harness.handles).toHaveLength(0);
      expect(harness.logs()).toContain("origin_not_allowed");
    } finally {
      await closeHarness(harness);
    }
  });

  it("enforces the global connection limit", async () => {
    const harness = await createHarness({ maxConnections: 1 });
    try {
      const first = await connect(harness.url);
      expect(await rejectionStatus(harness.url, ALLOWED_ORIGIN)).toBe(429);
      expect(harness.logs()).toContain("global_connection_limit");
      first.close();
      await waitForClose(first);
    } finally {
      await closeHarness(harness);
    }
  });

  it("enforces the per-IP connection limit", async () => {
    const harness = await createHarness({ maxConnectionsPerIp: 1 });
    try {
      const first = await connect(harness.url);
      expect(await rejectionStatus(harness.url, ALLOWED_ORIGIN)).toBe(429);
      expect(harness.logs()).toContain("ip_connection_limit");
      first.close();
      await waitForClose(first);
    } finally {
      await closeHarness(harness);
    }
  });

  it("disposes the Pyright session when the socket closes", async () => {
    const harness = await createHarness();
    try {
      const webSocket = await connect(harness.url);
      webSocket.close();
      await waitForClose(webSocket);
      await vi.waitFor(() => expect(harness.handles[0].dispose).toHaveBeenCalledOnce());
    } finally {
      await closeHarness(harness);
    }
  });

  it("disposes the socket and Pyright session after the idle timeout", async () => {
    const harness = await createHarness({ idleTimeoutMs: 20 });
    try {
      const webSocket = await connect(harness.url);
      expect(await waitForClose(webSocket)).toBe(1006);
      expect(harness.handles[0].dispose).toHaveBeenCalledOnce();
      expect(harness.logs()).toContain("idle_timeout");
    } finally {
      await closeHarness(harness);
    }
  });

  it("disposes every socket and Pyright session during server shutdown", async () => {
    const harness = await createHarness();
    const webSocket = await connect(harness.url);
    const closed = waitForClose(webSocket);

    await harness.lspServer.close();

    expect(await closed).toBe(1006);
    expect(harness.handles[0].dispose).toHaveBeenCalledOnce();
    expect(harness.logs()).toContain("server_shutdown");
    await closeHarness(harness);
  });

  it("disposes the socket and session when the Pyright child fails", async () => {
    const harness = await createHarness();
    try {
      const webSocket = await connect(harness.url);
      const closed = waitForClose(webSocket);
      harness.failures[0]({ kind: "process_exit", exitCode: 1, signal: null });

      expect(await closed).toBe(1006);
      expect(harness.handles[0].dispose).toHaveBeenCalledOnce();
      expect(harness.logs()).toContain("lsp_connection_failure");
    } finally {
      await closeHarness(harness);
    }
  });

  it("never includes JSON-RPC payloads in lifecycle logs", async () => {
    const harness = await createHarness();
    try {
      const webSocket = await connect(harness.url);
      webSocket.send("super-secret-document-text");
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(harness.logs()).not.toContain("super-secret-document-text");
      webSocket.close();
      await waitForClose(webSocket);
    } finally {
      await closeHarness(harness);
    }
  });
});
