import { describe, it, expect } from "vitest";
import { EnvError, parseEnv } from "./env";

describe("parseEnv", () => {
  it("applies development defaults when optional values are absent", () => {
    expect(parseEnv({})).toEqual({
      NODE_ENV: "development",
      PORT: 3000,
      LOG_LEVEL: "info",
      PUBLIC_APP_URL: "http://localhost:3000",
      LSP_MAX_CONNECTIONS: 20,
      LSP_MAX_CONNECTIONS_PER_IP: 2,
      LSP_IDLE_TIMEOUT_MS: 900000,
      DB_FILE_NAME: "./data/codetype.sqlite",
      BETTER_AUTH_SECRET: "development-only-secret-change-me-123456",
    });
  });

  it("parses a full production configuration", () => {
    expect(
      parseEnv({
        NODE_ENV: "production",
        PORT: "8080",
        LOG_LEVEL: "debug",
        PUBLIC_APP_URL: "https://codetype.example.com",
        LSP_MAX_CONNECTIONS: "40",
        LSP_MAX_CONNECTIONS_PER_IP: "5",
        LSP_IDLE_TIMEOUT_MS: "60000",
        DB_FILE_NAME: "/data/codetype.sqlite",
        BETTER_AUTH_SECRET: "production-secret-that-is-at-least-32-characters",
      }),
    ).toEqual({
      NODE_ENV: "production",
      PORT: 8080,
      LOG_LEVEL: "debug",
      PUBLIC_APP_URL: "https://codetype.example.com",
      LSP_MAX_CONNECTIONS: 40,
      LSP_MAX_CONNECTIONS_PER_IP: 5,
      LSP_IDLE_TIMEOUT_MS: 60000,
      DB_FILE_NAME: "/data/codetype.sqlite",
      BETTER_AUTH_SECRET: "production-secret-that-is-at-least-32-characters",
    });
  });

  it("respects an explicit DB_FILE_NAME", () => {
    expect(parseEnv({ DB_FILE_NAME: "/tmp/custom.sqlite" }).DB_FILE_NAME).toBe(
      "/tmp/custom.sqlite",
    );
  });

  it("requires DB_FILE_NAME in production", () => {
    expect(() =>
      parseEnv({
        NODE_ENV: "production",
        PUBLIC_APP_URL: "https://codetype.example.com",
        BETTER_AUTH_SECRET: "production-secret-that-is-at-least-32-characters",
      }),
    ).toThrow(/DB_FILE_NAME is required/);
  });

  it("silences logs and derives the local origin under test", () => {
    expect(parseEnv({ NODE_ENV: "test" })).toMatchObject({
      LOG_LEVEL: "silent",
      PUBLIC_APP_URL: "http://localhost:3000",
    });
  });

  it("derives PUBLIC_APP_URL from a custom PORT in development", () => {
    expect(parseEnv({ PORT: "4321" }).PUBLIC_APP_URL).toBe("http://localhost:4321");
  });

  it("requires PUBLIC_APP_URL in production", () => {
    expect(() =>
      parseEnv({
        NODE_ENV: "production",
        DB_FILE_NAME: "/data/codetype.sqlite",
        BETTER_AUTH_SECRET: "production-secret-that-is-at-least-32-characters",
      }),
    ).toThrow(/PUBLIC_APP_URL is required/);
  });

  it("requires a strong BETTER_AUTH_SECRET in production", () => {
    expect(() =>
      parseEnv({
        NODE_ENV: "production",
        PUBLIC_APP_URL: "https://codetype.example.com",
        DB_FILE_NAME: "/data/codetype.sqlite",
      }),
    ).toThrow(/BETTER_AUTH_SECRET is required/);
    expect(() => parseEnv({ BETTER_AUTH_SECRET: "too-short" })).toThrow(/at least 32 characters/);
  });

  it("rejects a non-numeric PORT", () => {
    expect(() => parseEnv({ PORT: "abc" })).toThrow(/PORT must be an integer/);
  });

  it("rejects an out-of-range PORT", () => {
    expect(() => parseEnv({ PORT: "99999" })).toThrow(
      /PORT must be an integer between 1 and 65535/,
    );
  });

  it("rejects an invalid LOG_LEVEL", () => {
    expect(() => parseEnv({ LOG_LEVEL: "loud" })).toThrow(/LOG_LEVEL must be one of/);
  });

  it("rejects an invalid NODE_ENV", () => {
    expect(() => parseEnv({ NODE_ENV: "staging" })).toThrow(/NODE_ENV must be one of/);
  });

  it.each(["LSP_MAX_CONNECTIONS", "LSP_MAX_CONNECTIONS_PER_IP", "LSP_IDLE_TIMEOUT_MS"])(
    "rejects an invalid %s",
    (name) => {
      expect(() => parseEnv({ [name]: "0" })).toThrow(`${name} must be an integer`);
    },
  );

  it("rejects a non-http PUBLIC_APP_URL", () => {
    expect(() => parseEnv({ PUBLIC_APP_URL: "ftp://example.com" })).toThrow(
      /PUBLIC_APP_URL must be a valid http/,
    );
  });

  it("aggregates every issue into a single EnvError", () => {
    let error: unknown;
    try {
      // DB_FILE_NAME is supplied so the only issues are the three invalid values
      // under test, not the separately covered production DB requirement.
      parseEnv({
        PORT: "abc",
        LOG_LEVEL: "loud",
        NODE_ENV: "production",
        DB_FILE_NAME: "/data/codetype.sqlite",
        BETTER_AUTH_SECRET: "production-secret-that-is-at-least-32-characters",
      });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(EnvError);
    const envError = error as EnvError;
    expect(envError.issues).toHaveLength(3);
    expect(envError.message).toContain("PORT");
    expect(envError.message).toContain("LOG_LEVEL");
    expect(envError.message).toContain("PUBLIC_APP_URL");
  });

  it("returns a frozen object", () => {
    expect(Object.isFrozen(parseEnv({}))).toBe(true);
  });
});
