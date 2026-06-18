import { describe, it, expect } from "vitest";
import { EnvError, parseEnv } from "./env";

describe("parseEnv", () => {
  it("applies development defaults when optional values are absent", () => {
    expect(parseEnv({})).toEqual({
      NODE_ENV: "development",
      PORT: 3000,
      LOG_LEVEL: "info",
      PUBLIC_APP_URL: "http://localhost:3000",
    });
  });

  it("parses a full production configuration", () => {
    expect(
      parseEnv({
        NODE_ENV: "production",
        PORT: "8080",
        LOG_LEVEL: "debug",
        PUBLIC_APP_URL: "https://codetype.example.com",
      }),
    ).toEqual({
      NODE_ENV: "production",
      PORT: 8080,
      LOG_LEVEL: "debug",
      PUBLIC_APP_URL: "https://codetype.example.com",
    });
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
    expect(() => parseEnv({ NODE_ENV: "production" })).toThrow(/PUBLIC_APP_URL is required/);
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

  it("rejects a non-http PUBLIC_APP_URL", () => {
    expect(() => parseEnv({ PUBLIC_APP_URL: "ftp://example.com" })).toThrow(
      /PUBLIC_APP_URL must be a valid http/,
    );
  });

  it("aggregates every issue into a single EnvError", () => {
    let error: unknown;
    try {
      parseEnv({ PORT: "abc", LOG_LEVEL: "loud", NODE_ENV: "production" });
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
