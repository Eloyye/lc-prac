import { createMiddleware } from "hono/factory";
import type { Auth } from "../auth";
import type { RequestLoggerVariables } from "./request-logger";

type SessionData = Auth["$Infer"]["Session"];

export type AuthVariables = {
  user: SessionData["user"] | null;
  session: SessionData["session"] | null;
};

type SessionMiddlewareEnv = {
  Variables: AuthVariables & RequestLoggerVariables;
};

/** Resolve the cookie session once and expose it to every downstream route. */
export function sessionContext(auth?: Auth) {
  return createMiddleware<SessionMiddlewareEnv>(async (c, next) => {
    const current =
      auth === undefined
        ? null
        : await auth.api.getSession({
            headers: c.req.raw.headers,
          });

    c.set("user", current?.user ?? null);
    c.set("session", current?.session ?? null);
    c.set("userId", current?.user.id ?? null);
    await next();
  });
}

/** Reject anonymous access using the app-wide API error envelope. */
export const requireUser = createMiddleware<SessionMiddlewareEnv>(async (c, next) => {
  if (c.var.user === null) {
    const requestId = c.var.requestId;
    return c.json(
      {
        error: {
          code: "UNAUTHORIZED",
          message: "Sign in required.",
          requestId,
        },
      },
      401,
    );
  }
  await next();
});
