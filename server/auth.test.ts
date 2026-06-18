import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { pino } from "pino";
import type { Logger } from "pino";
import { createApp } from "./app";
import { createAuth } from "./auth";
import { openDatabase } from "./db/client";
import type { DbConnection } from "./db/client";
import { runMigrations } from "./db/migrate";
import { requireUser } from "./middleware/session";

const ORIGIN = "http://localhost:3000";
const SECRET = "test-secret-that-is-at-least-32-characters";
const PASSWORD = "correct-horse-battery-staple";

type ErrorBody = {
  error: { code: string; message: string; requestId: string };
};

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

function cookieFrom(response: Response): string {
  const setCookie = response.headers.get("set-cookie");
  if (setCookie === null) throw new Error("Expected a session cookie");
  return setCookie.split(";", 1)[0];
}

async function authPost(
  app: ReturnType<typeof createApp>,
  path: string,
  body: Record<string, string>,
  cookie?: string,
): Promise<Response> {
  return app.request(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: ORIGIN,
      ...(cookie === undefined ? {} : { cookie }),
    },
    body: JSON.stringify(body),
  });
}

describe("account authentication", () => {
  let connection: DbConnection;
  let app: ReturnType<typeof createApp>;
  let entries: () => Record<string, unknown>[];

  beforeEach(() => {
    connection = openDatabase(":memory:");
    runMigrations(connection.db);
    const captured = captureLogger();
    entries = captured.entries;
    const auth = createAuth({
      db: connection.db,
      baseURL: ORIGIN,
      secret: SECRET,
      secureCookies: false,
    });
    app = createApp({ logger: captured.logger, auth, db: connection.db });
    app.get("/api/protected", requireUser, (c) => c.json({ userId: c.var.user!.id }));
  });

  afterEach(() => {
    connection.close();
  });

  it("signs up, restores the cookie session on refresh, and exposes identity", async () => {
    const signUp = await authPost(app, "/api/auth/sign-up/email", {
      name: "Ada Lovelace",
      email: "ada@example.com",
      password: PASSWORD,
    });

    expect(signUp.status).toBe(200);
    const cookie = cookieFrom(signUp);
    expect(signUp.headers.get("set-cookie")).toMatch(/Max-Age=604800/);
    expect(signUp.headers.get("set-cookie")).toMatch(/HttpOnly/);
    expect(signUp.headers.get("set-cookie")).toMatch(/SameSite=Lax/);

    // A new page load has only the persisted cookie and must recover the session.
    const refreshed = await app.request("/api/auth/get-session", { headers: { cookie } });
    expect(refreshed.status).toBe(200);
    const session = (await refreshed.json()) as { user: { id: string; email: string } };
    expect(session.user.email).toBe("ada@example.com");

    const me = await app.request("/api/me", { headers: { cookie } });
    expect(await me.json()).toEqual({
      user: { id: session.user.id, email: "ada@example.com", name: "Ada Lovelace" },
    });

    const protectedResponse = await app.request("/api/protected", { headers: { cookie } });
    expect(protectedResponse.status).toBe(200);
    expect(await protectedResponse.json()).toEqual({ userId: session.user.id });

    const protectedLog = entries().find((entry) => entry.path === "/api/protected");
    expect(protectedLog).toMatchObject({ userId: session.user.id, status: 200 });
    const allLogs = JSON.stringify(entries());
    expect(allLogs).not.toContain(PASSWORD);
    expect(allLogs).not.toContain(cookie);
    expect(allLogs).not.toContain("authorization");
  });

  it("signs out, rejects the revoked session, and signs back in", async () => {
    const signUp = await authPost(app, "/api/auth/sign-up/email", {
      name: "Grace Hopper",
      email: "grace@example.com",
      password: PASSWORD,
    });
    const originalCookie = cookieFrom(signUp);

    const signOut = await authPost(app, "/api/auth/sign-out", {}, originalCookie);
    expect(signOut.status).toBe(200);
    expect(await signOut.json()).toEqual({ success: true });

    const revoked = await app.request("/api/protected", {
      headers: { cookie: originalCookie },
    });
    expect(revoked.status).toBe(401);

    const signIn = await authPost(app, "/api/auth/sign-in/email", {
      email: "grace@example.com",
      password: PASSWORD,
    });
    expect(signIn.status).toBe(200);
    const newCookie = cookieFrom(signIn);
    expect(newCookie).not.toBe(originalCookie);
    expect(
      (await (
        await app.request("/api/auth/get-session", { headers: { cookie: newCookie } })
      ).json()) as unknown,
    ).toMatchObject({
      user: { email: "grace@example.com" },
    });
  });

  it("returns the standard 401 error shape for anonymous protected requests", async () => {
    const response = await app.request("/api/protected");

    expect(response.status).toBe(401);
    const body = (await response.json()) as ErrorBody;
    expect(body.error).toEqual({
      code: "UNAUTHORIZED",
      message: "Sign in required.",
      requestId: response.headers.get("x-request-id"),
    });
  });

  it("uses secure same-origin cookies in production mode", async () => {
    const secureOrigin = "https://codetype.example.com";
    const auth = createAuth({
      db: connection.db,
      baseURL: secureOrigin,
      secret: SECRET,
      secureCookies: true,
    });
    const secureApp = createApp({ logger: pino({ level: "silent" }), auth });
    const response = await secureApp.request(`${secureOrigin}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: secureOrigin },
      body: JSON.stringify({
        name: "Katherine Johnson",
        email: "katherine@example.com",
        password: PASSWORD,
      }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toMatch(
      /^__Secure-better-auth\.session_token=.*;.* Path=\/; HttpOnly; Secure; SameSite=Lax$/,
    );
  });
});
