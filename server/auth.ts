import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import type { Db } from "./db/client";
import * as schema from "./db/schema";

export const SESSION_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 7;
export const SESSION_UPDATE_AGE_SECONDS = 60 * 60 * 24;

export type CreateAuthOptions = {
  db: Db;
  baseURL: string;
  secret: string;
  secureCookies: boolean;
};

/** Build Better Auth against the application's Drizzle connection. */
export function createAuth(options: CreateAuthOptions) {
  return betterAuth({
    appName: "CodeType",
    baseURL: options.baseURL,
    basePath: "/api/auth",
    secret: options.secret,
    database: drizzleAdapter(options.db, {
      provider: "sqlite",
      schema,
    }),
    emailAndPassword: {
      enabled: true,
    },
    session: {
      expiresIn: SESSION_EXPIRES_IN_SECONDS,
      updateAge: SESSION_UPDATE_AGE_SECONDS,
    },
    trustedOrigins: [options.baseURL],
    advanced: {
      useSecureCookies: options.secureCookies,
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        secure: options.secureCookies,
        path: "/",
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
