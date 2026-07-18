import { pino } from "pino";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SettingsResponse } from "../../shared/types";
import { createApp } from "../app";
import { createAuth } from "../auth";
import { openDatabase } from "../db/client";
import type { DbConnection } from "../db/client";
import { runMigrations } from "../db/migrate";

const logger = pino({ level: "silent" });
const ORIGIN = "http://localhost:3000";
const SECRET = "test-secret-that-is-at-least-32-characters";
const PASSWORD = "correct-horse-battery-staple";

let conn: DbConnection;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  conn = openDatabase(":memory:");
  runMigrations(conn.db);
  const auth = createAuth({
    db: conn.db,
    baseURL: ORIGIN,
    secret: SECRET,
    secureCookies: false,
  });
  app = createApp({ logger, auth, db: conn.db });
});

afterEach(() => {
  conn.close();
});

function cookieFrom(response: Response): string {
  const setCookie = response.headers.get("set-cookie");
  if (setCookie === null) throw new Error("Expected a session cookie");
  return setCookie.split(";", 1)[0];
}

async function signUp(name: string, email: string): Promise<string> {
  const response = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({ name, email, password: PASSWORD }),
  });
  expect(response.status).toBe(200);
  return cookieFrom(response);
}

async function request(cookie: string, method = "GET", body?: unknown): Promise<Response> {
  return await app.request("/api/settings", {
    method,
    headers: {
      cookie,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe("/api/settings", () => {
  it("has only the synchronized fields and server metadata, with account defaults", async () => {
    const columns = conn.sqlite
      .prepare("PRAGMA table_info('user_settings')")
      .all()
      .map((column) => (column as { name: string }).name);
    expect(columns).toEqual(["user_id", "mode", "distraction_free", "updated_at_ms"]);

    expect((await app.request("/api/settings")).status).toBe(401);
    const cookie = await signUp("Ada", "settings-defaults@example.com");
    const response = await request(cookie);
    expect(response.status).toBe(200);
    const body = (await response.json()) as SettingsResponse;
    expect(body.settings).toEqual({
      mode: "copy",
      distractionFree: false,
      updatedAt: expect.any(String),
    });
    expect(Number.isFinite(Date.parse(body.settings.updatedAt))).toBe(true);
  });

  it("validates a complete replacement and rejects unsynchronized fields", async () => {
    const cookie = await signUp("Ada", "settings-validation@example.com");
    for (const body of [
      { mode: "speed", distractionFree: false },
      { mode: "copy" },
      { mode: "copy", distractionFree: "yes" },
      { mode: "copy", distractionFree: false, theme: "dark" },
      { mode: "copy", distractionFree: false, smoothCaret: true },
      { mode: "copy", distractionFree: false, paletteOpen: true },
    ]) {
      const response = await request(cookie, "PUT", body);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: { code: "VALIDATION" } });
    }

    expect((await app.request("/api/settings", { method: "PUT" })).status).toBe(401);
  });

  it("persists replacements across refreshes and isolates accounts", async () => {
    const owner = await signUp("Owner", "settings-owner@example.com");
    const other = await signUp("Other", "settings-other@example.com");

    const update = await request(owner, "PUT", { mode: "recall", distractionFree: true });
    expect(update.status).toBe(200);
    expect((await update.json()) as SettingsResponse).toMatchObject({
      settings: { mode: "recall", distractionFree: true },
    });

    // A new app instance against the same database represents a page refresh or
    // another signed-in device using the existing account cookie.
    const refreshedApp = createApp({
      logger,
      auth: createAuth({
        db: conn.db,
        baseURL: ORIGIN,
        secret: SECRET,
        secureCookies: false,
      }),
      db: conn.db,
    });
    const refreshed = await refreshedApp.request("/api/settings", { headers: { cookie: owner } });
    expect((await refreshed.json()) as SettingsResponse).toMatchObject({
      settings: { mode: "recall", distractionFree: true },
    });

    const isolated = await request(other);
    expect((await isolated.json()) as SettingsResponse).toMatchObject({
      settings: { mode: "copy", distractionFree: false },
    });
  });
});
