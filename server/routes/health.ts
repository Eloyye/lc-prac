import { Hono } from "hono";

/**
 * Health/readiness endpoint, mounted under `/api`. Stable and dependency-free so
 * it stays meaningful as a liveness probe even as the server grows a database
 * and auth: a `200 { ok: true }` means the process is up and routing requests.
 */
export const health = new Hono();

health.get("/health", (c) => c.json({ ok: true }));
