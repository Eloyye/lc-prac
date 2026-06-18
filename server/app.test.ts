import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pino } from "pino";
import type { Logger } from "pino";
import { createApp } from "./app";

type ApiErrorBody = { error: { code: string; message: string; requestId: string } };

function captureLogger(): { logger: Logger; entries: () => Record<string, unknown>[] } {
  const lines: string[] = [];
  const logger = pino(
    { level: "trace", base: undefined },
    {
      write(chunk: string) {
        lines.push(chunk);
      },
    },
  );
  return {
    logger,
    entries: () => lines.map((line) => JSON.parse(line) as Record<string, unknown>),
  };
}

describe("createApp", () => {
  it("answers GET /api/health with a stable payload, a request id, and one log", async () => {
    const { logger, entries } = captureLogger();
    const res = await createApp({ logger }).request("/api/health");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const requestId = res.headers.get("x-request-id");
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/);

    const logs = entries();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ method: "GET", path: "/api/health", status: 200 });
    expect(logs[0].requestId).toBe(requestId);
  });

  it("returns a JSON 404 carrying the request id for unknown API routes", async () => {
    const { logger } = captureLogger();
    const res = await createApp({ logger }).request("/api/not-a-route");

    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = (await res.json()) as ApiErrorBody;
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error.requestId).toBe(res.headers.get("x-request-id"));
  });

  it("maps an unexpected error to a generic JSON 500 without leaking internals", async () => {
    const { logger, entries } = captureLogger();
    const app = createApp({ logger });
    app.get("/api/boom", () => {
      throw new Error("explode-with-secrets");
    });

    const res = await app.request("/api/boom");
    expect(res.status).toBe(500);
    const body = (await res.json()) as ApiErrorBody;
    expect(body.error.code).toBe("INTERNAL");
    expect(body.error.message).not.toContain("explode-with-secrets");
    expect(body.error.requestId).toBe(res.headers.get("x-request-id"));

    const failure = entries().at(-1);
    expect(failure).toMatchObject({ level: 50, status: 500, msg: "request failed" });
  });

  describe("with a built SPA", () => {
    let root: string;

    beforeEach(async () => {
      root = await mkdtemp(join(tmpdir(), "codetype-app-"));
      await writeFile(join(root, "index.html"), "<!doctype html><title>CodeType</title>");
    });

    afterEach(async () => {
      await rm(root, { recursive: true, force: true });
    });

    it("serves the SPA shell for a client deep link", async () => {
      const { logger } = captureLogger();
      const res = await createApp({ logger, staticRoot: root }).request("/problems/two-sum");

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/html");
      expect(await res.text()).toContain("CodeType");
    });

    it("still returns JSON 404 for unknown API routes when serving the SPA", async () => {
      const { logger } = captureLogger();
      const res = await createApp({ logger, staticRoot: root }).request("/api/not-a-route");

      expect(res.status).toBe(404);
      expect(res.headers.get("content-type")).toContain("application/json");
    });
  });
});
