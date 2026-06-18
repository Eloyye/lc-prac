import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { EventEmitter } from "node:events";
import type { IncomingMessage } from "node:http";
import { createRequire } from "node:module";
import type { Duplex } from "node:stream";
import type { Logger } from "pino";
import { WebSocket, WebSocketServer } from "ws";
import {
  createProcessStreamConnection,
  createWebSocketConnection,
  forward,
} from "vscode-ws-jsonrpc/server";

export const LSP_PATH = "/lsp";
export const DEFAULT_LSP_MAX_CONNECTIONS = 20;
export const DEFAULT_LSP_MAX_CONNECTIONS_PER_IP = 2;
export const DEFAULT_LSP_IDLE_TIMEOUT_MS = 15 * 60 * 1000;

export type LspProcessFailure = {
  kind: "spawn_error" | "process_exit";
  errorName?: string;
  exitCode?: number | null;
  signal?: NodeJS.Signals | null;
};

export type LspSessionHandle = {
  dispose(): void;
  /** Resolves after the child process has exited and its stdio has closed. */
  closed?: Promise<void>;
};

export type LspSessionLauncher = (
  webSocket: WebSocket,
  onFailure: (failure: LspProcessFailure) => void,
) => LspSessionHandle;

export type PyrightLspServerOptions = {
  logger: Logger;
  allowedOrigins?: readonly string[];
  maxConnections?: number;
  maxConnectionsPerIp?: number;
  idleTimeoutMs?: number;
  launchSession?: LspSessionLauncher;
};

export type PyrightLspServer = {
  attach(server: EventEmitter): void;
  close(): Promise<void>;
};

type SessionState = {
  connectionId: string;
  ip: string;
  origin: string;
  openedAt: number;
  webSocket: WebSocket;
  idleTimer?: NodeJS.Timeout;
  handle?: LspSessionHandle;
  disposed: boolean;
};

const require = createRequire(import.meta.url);

function pyrightLangserverPath(): string {
  return require.resolve("pyright/langserver.index.js");
}

function createPyrightSession(
  webSocket: WebSocket,
  onFailure: (failure: LspProcessFailure) => void,
): LspSessionHandle {
  const child = spawn(process.execPath, [pyrightLangserverPath(), "--stdio"], {
    stdio: ["pipe", "pipe", "ignore"],
    windowsHide: true,
  });
  const serverConnection = createProcessStreamConnection(child);
  if (serverConnection === undefined) {
    child.kill();
    throw new Error("Pyright did not expose stdio pipes.");
  }

  const clientConnection = createWebSocketConnection({
    send: (content: string) => webSocket.send(content),
    onMessage: (callback: (data: string) => void) =>
      webSocket.on("message", (data) => callback(data.toString())),
    onError: (callback: (error: unknown) => void) => webSocket.on("error", callback),
    onClose: (callback: (code: number, reason: string) => void) =>
      webSocket.on("close", (code, reason) => callback(code, reason.toString())),
    dispose: () => webSocket.close(),
  });

  forward(clientConnection, serverConnection);

  let disposed = false;
  let forceKillTimer: NodeJS.Timeout | undefined;
  const closed = new Promise<void>((resolve) => {
    child.once("close", () => {
      if (forceKillTimer !== undefined) clearTimeout(forceKillTimer);
      resolve();
    });
  });

  child.once("error", (error) => {
    if (!disposed) onFailure({ kind: "spawn_error", errorName: error.name });
  });
  child.once("exit", (exitCode, signal) => {
    if (!disposed) onFailure({ kind: "process_exit", exitCode, signal });
  });

  return {
    closed,
    dispose() {
      if (disposed) return;
      disposed = true;
      clientConnection.dispose();
      serverConnection.dispose();

      // Pyright normally exits on SIGTERM. Escalate so shutdown cannot retain
      // an orphaned language server if it fails to cooperate.
      if (child.exitCode === null && child.signalCode === null) {
        child.kill();
        forceKillTimer = setTimeout(() => {
          if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
        }, 1000);
        forceKillTimer.unref();
      }
    },
  };
}

function assertPositiveInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new TypeError(`${name} must be a positive integer.`);
  }
}

function requestPath(request: IncomingMessage): string | undefined {
  try {
    return new URL(request.url ?? "/", "http://localhost").pathname;
  } catch {
    return undefined;
  }
}

function requestOrigin(request: IncomingMessage): string | undefined {
  const value = request.headers.origin;
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.origin !== value) {
      return undefined;
    }
    return url.origin;
  } catch {
    return undefined;
  }
}

function isSameOriginRequest(request: IncomingMessage, origin: string): boolean {
  const host = request.headers.host;
  const encrypted = "encrypted" in request.socket && request.socket.encrypted === true;
  const protocol = encrypted ? "https:" : "http:";
  const parsedOrigin = new URL(origin);
  return (
    typeof host === "string" && parsedOrigin.protocol === protocol && parsedOrigin.host === host
  );
}

function rejectUpgrade(socket: Duplex, status: number, statusText: string): void {
  if (socket.destroyed) return;
  socket.end(`HTTP/1.1 ${status} ${statusText}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
}

/**
 * A single, host-agnostic `/lsp` capability. Both Vite and the production
 * application attach this object to their own HTTP server.
 */
export function createPyrightLspServer(options: PyrightLspServerOptions): PyrightLspServer {
  const maxConnections = options.maxConnections ?? DEFAULT_LSP_MAX_CONNECTIONS;
  const maxConnectionsPerIp = options.maxConnectionsPerIp ?? DEFAULT_LSP_MAX_CONNECTIONS_PER_IP;
  const idleTimeoutMs = options.idleTimeoutMs ?? DEFAULT_LSP_IDLE_TIMEOUT_MS;
  assertPositiveInteger("maxConnections", maxConnections);
  assertPositiveInteger("maxConnectionsPerIp", maxConnectionsPerIp);
  assertPositiveInteger("idleTimeoutMs", idleTimeoutMs);

  const allowedOrigins = options.allowedOrigins?.map((value) => new URL(value).origin);
  const launchSession = options.launchSession ?? createPyrightSession;
  const webSocketServer = new WebSocketServer({ noServer: true });
  const sessions = new Map<WebSocket, SessionState>();
  const connectionsByIp = new Map<string, number>();
  const pendingReaps = new Set<Promise<void>>();
  let attachedServer: EventEmitter | undefined;
  let closing = false;
  let closePromise: Promise<void> | undefined;

  const changeIpCount = (ip: string, delta: number): void => {
    const next = (connectionsByIp.get(ip) ?? 0) + delta;
    if (next === 0) connectionsByIp.delete(ip);
    else connectionsByIp.set(ip, next);
  };

  const trackReap = (closed: Promise<void> | undefined): void => {
    if (closed === undefined) return;
    const tracked = closed.catch(() => {}).finally(() => pendingReaps.delete(tracked));
    pendingReaps.add(tracked);
  };

  const disposeSession = (
    state: SessionState,
    reason: "socket_close" | "socket_error" | "idle_timeout" | "server_shutdown" | "child_failure",
    closeCode?: number,
    failure?: LspProcessFailure,
  ): void => {
    if (state.disposed) return;
    state.disposed = true;
    if (state.idleTimer !== undefined) clearTimeout(state.idleTimer);
    sessions.delete(state.webSocket);
    changeIpCount(state.ip, -1);
    state.handle?.dispose();

    if (reason !== "socket_close" && state.webSocket.readyState !== WebSocket.CLOSED) {
      state.webSocket.terminate();
    }

    if (failure !== undefined) {
      options.logger.error(
        {
          event: "lsp_connection_failure",
          connectionId: state.connectionId,
          remoteAddress: state.ip,
          failureKind: failure.kind,
          errorName: failure.errorName,
          exitCode: failure.exitCode,
          signal: failure.signal,
        },
        "LSP connection failed",
      );
    }
    options.logger.info(
      {
        event: "lsp_connection_closed",
        connectionId: state.connectionId,
        remoteAddress: state.ip,
        origin: state.origin,
        reason,
        closeCode,
        durationMs: Date.now() - state.openedAt,
      },
      "LSP connection closed",
    );
  };

  const resetIdleTimer = (state: SessionState): void => {
    if (state.idleTimer !== undefined) clearTimeout(state.idleTimer);
    state.idleTimer = setTimeout(() => disposeSession(state, "idle_timeout"), idleTimeoutMs);
    state.idleTimer.unref();
  };

  const accept = (webSocket: WebSocket, request: IncomingMessage, origin: string, ip: string) => {
    const state: SessionState = {
      connectionId: randomUUID(),
      ip,
      origin,
      openedAt: Date.now(),
      webSocket,
      disposed: false,
    };
    sessions.set(webSocket, state);
    changeIpCount(ip, 1);
    resetIdleTimer(state);

    webSocket.on("message", () => resetIdleTimer(state));
    webSocket.once("close", (code) => disposeSession(state, "socket_close", code));
    webSocket.once("error", () => disposeSession(state, "socket_error"));

    options.logger.info(
      {
        event: "lsp_connection_opened",
        connectionId: state.connectionId,
        remoteAddress: ip,
        origin,
        activeConnections: sessions.size,
      },
      "LSP connection opened",
    );

    try {
      const handle = launchSession(webSocket, (failure) =>
        disposeSession(state, "child_failure", undefined, failure),
      );
      state.handle = handle;
      trackReap(handle.closed);
      if (state.disposed) handle.dispose();
    } catch (error) {
      disposeSession(state, "child_failure", undefined, {
        kind: "spawn_error",
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
    }
  };

  const logRejected = (request: IncomingMessage, ip: string, reason: string): void => {
    options.logger.warn(
      {
        event: "lsp_upgrade_rejected",
        remoteAddress: ip,
        origin: requestOrigin(request),
        reason,
        activeConnections: sessions.size,
      },
      "LSP upgrade rejected",
    );
  };

  const onUpgrade = (request: IncomingMessage, socket: Duplex, head: Buffer): void => {
    if (requestPath(request) !== LSP_PATH) return;

    const ip = request.socket.remoteAddress ?? "unknown";
    const origin = requestOrigin(request);
    const originAllowed =
      origin !== undefined &&
      (allowedOrigins === undefined
        ? isSameOriginRequest(request, origin)
        : allowedOrigins.includes(origin));
    if (!originAllowed) {
      logRejected(request, ip, "origin_not_allowed");
      rejectUpgrade(socket, 403, "Forbidden");
      return;
    }
    if (closing) {
      logRejected(request, ip, "server_shutting_down");
      rejectUpgrade(socket, 503, "Service Unavailable");
      return;
    }
    if (sessions.size >= maxConnections) {
      logRejected(request, ip, "global_connection_limit");
      rejectUpgrade(socket, 429, "Too Many Requests");
      return;
    }
    if ((connectionsByIp.get(ip) ?? 0) >= maxConnectionsPerIp) {
      logRejected(request, ip, "ip_connection_limit");
      rejectUpgrade(socket, 429, "Too Many Requests");
      return;
    }

    webSocketServer.handleUpgrade(request, socket, head, (webSocket) =>
      accept(webSocket, request, origin, ip),
    );
  };

  webSocketServer.on("error", (error) => {
    options.logger.error(
      { event: "lsp_server_failure", errorName: error.name },
      "LSP WebSocket server failed",
    );
  });

  const close = (): Promise<void> => {
    if (closePromise !== undefined) return closePromise;
    closing = true;
    closePromise = (async () => {
      if (attachedServer !== undefined) {
        attachedServer.off("upgrade", onUpgrade);
        attachedServer.off("close", onServerClose);
      }

      for (const state of [...sessions.values()]) disposeSession(state, "server_shutdown");
      const webSocketClose = new Promise<void>((resolve) => webSocketServer.close(() => resolve()));
      await Promise.all([webSocketClose, Promise.allSettled([...pendingReaps])]);
    })();
    return closePromise;
  };

  const onServerClose = (): void => {
    void close();
  };

  return {
    attach(server) {
      if (attachedServer !== undefined) throw new Error("LSP server is already attached.");
      if (closing) throw new Error("LSP server is already closed.");
      attachedServer = server;
      server.on("upgrade", onUpgrade);
      server.once("close", onServerClose);
    },
    close,
  };
}
