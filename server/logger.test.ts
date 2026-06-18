import { describe, it, expect } from "vitest";
import { pino } from "pino";
import { parseEnv } from "./env";
import { loggerOptions } from "./logger";

function capture() {
  const lines: string[] = [];
  const env = parseEnv({
    NODE_ENV: "production",
    PUBLIC_APP_URL: "https://codetype.example.com",
    DB_FILE_NAME: "/data/codetype.sqlite",
    BETTER_AUTH_SECRET: "production-secret-that-is-at-least-32-characters",
    LOG_LEVEL: "trace",
  });
  const logger = pino(
    { ...loggerOptions(env), base: undefined },
    {
      write(chunk: string) {
        lines.push(chunk);
      },
    },
  );
  return { logger, lines };
}

describe("loggerOptions", () => {
  it("removes cookies, auth headers, passwords, and solution code", () => {
    const { logger, lines } = capture();
    logger.info(
      {
        req: { headers: { authorization: "Bearer secret-token", cookie: "session=abc" } },
        body: { password: "hunter2", code: "print('do not log me')", note: "request-body" },
        token: "raw-session-token",
        solution: { code: "def solve(): return 42" },
        code: "top-level-secret",
        keep: "visible-field",
      },
      "event",
    );

    expect(lines).toHaveLength(1);
    const line = lines[0];
    expect(line).toContain("visible-field");
    expect(line).not.toContain("secret-token");
    expect(line).not.toContain("session=abc");
    expect(line).not.toContain("hunter2");
    expect(line).not.toContain("request-body");
    expect(line).not.toContain("raw-session-token");
    expect(line).not.toContain("do not log me");
    expect(line).not.toContain("def solve");
    expect(line).not.toContain("top-level-secret");
  });

  it("honours the configured log level", () => {
    expect(loggerOptions(parseEnv({ LOG_LEVEL: "warn" })).level).toBe("warn");
  });
});
