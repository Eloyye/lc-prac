import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { pino, stdSerializers } from "pino";
import { requestLogger } from "./request-logger";

function setup() {
  const lines: string[] = [];
  const logger = pino(
    { level: "trace", base: undefined, serializers: { err: stdSerializers.err } },
    {
      write(chunk: string) {
        lines.push(chunk);
      },
    },
  );
  const app = new Hono();
  app.use("*", requestLogger(logger));
  app.get("/ok", (c) => c.json({ ok: true }));
  app.get("/missing", (c) => c.json({ error: "nope" }, 404));
  app.get("/boom", () => {
    throw new Error("kaboom");
  });
  app.onError((_error, c) => c.json({ error: "internal" }, 500));
  return { app, entries: () => lines.map((line) => JSON.parse(line) as Record<string, unknown>) };
}

const SENSITIVE_HEADERS = { cookie: "session=top-secret", authorization: "Bearer token-xyz" };

describe("requestLogger", () => {
  it("emits one info log and a request id header for a success", async () => {
    const { app, entries } = setup();
    const res = await app.request("/ok", { headers: SENSITIVE_HEADERS });

    expect(res.status).toBe(200);
    const requestId = res.headers.get("x-request-id");
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/);

    const logs = entries();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      level: 30,
      requestId,
      method: "GET",
      path: "/ok",
      status: 200,
      msg: "request completed",
    });
    expect(typeof logs[0].durationMs).toBe("number");
  });

  it("never includes cookies or authorization headers in the log", async () => {
    const { app, entries } = setup();
    await app.request("/ok", { headers: SENSITIVE_HEADERS });

    const line = JSON.stringify(entries()[0]);
    expect(line).not.toContain("top-secret");
    expect(line).not.toContain("token-xyz");
    expect(line).not.toContain("cookie");
    expect(line).not.toContain("authorization");
  });

  it("logs expected 4xx responses at warn level", async () => {
    const { app, entries } = setup();
    const res = await app.request("/missing");

    expect(res.status).toBe(404);
    expect(entries()[0]).toMatchObject({ level: 40, status: 404, msg: "request rejected" });
  });

  it("logs thrown errors once at error level with a 500 status", async () => {
    const { app, entries } = setup();
    const res = await app.request("/boom");

    expect(res.status).toBe(500);
    const logs = entries();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ level: 50, status: 500, msg: "request failed" });
    expect((logs[0].err as { message: string }).message).toBe("kaboom");
  });
});
