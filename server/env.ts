import {
  DEFAULT_LSP_IDLE_TIMEOUT_MS,
  DEFAULT_LSP_MAX_CONNECTIONS,
  DEFAULT_LSP_MAX_CONNECTIONS_PER_IP,
} from "./lsp";

/**
 * Typed parsing and validation of process environment for the application
 * server. Validation runs once at startup (see `index.ts`); any invalid value
 * aborts boot with a single, actionable error rather than failing later at an
 * arbitrary request. Optional values fall back to development-friendly defaults.
 */

const NODE_ENVS = ["development", "production", "test"] as const;
export type NodeEnv = (typeof NODE_ENVS)[number];

// Pino's level vocabulary, plus "silent" to disable logging (used under test).
const LOG_LEVELS = ["fatal", "error", "warn", "info", "debug", "trace", "silent"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export type Env = {
  readonly NODE_ENV: NodeEnv;
  readonly PORT: number;
  readonly LOG_LEVEL: LogLevel;
  readonly PUBLIC_APP_URL: string;
  readonly LSP_MAX_CONNECTIONS: number;
  readonly LSP_MAX_CONNECTIONS_PER_IP: number;
  readonly LSP_IDLE_TIMEOUT_MS: number;
  readonly DB_FILE_NAME: string;
};

export type EnvSource = Record<string, string | undefined>;

/** Thrown when one or more environment values are missing or invalid. */
export class EnvError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(
      `Invalid environment configuration:\n${issues.map((issue) => `  - ${issue}`).join("\n")}`,
    );
    this.name = "EnvError";
    this.issues = issues;
  }
}

function isValidHttpUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return url.protocol === "http:" || url.protocol === "https:";
}

function parsePositiveInteger(
  source: EnvSource,
  name: string,
  fallback: number,
  maximum: number,
  issues: string[],
): number {
  const raw = source[name];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    issues.push(`${name} must be an integer between 1 and ${maximum} (received "${raw}").`);
    return fallback;
  }
  return parsed;
}

/**
 * Validate an environment source into a frozen, typed config. Collects every
 * problem before throwing so a misconfigured deployment sees all issues at once.
 */
export function parseEnv(source: EnvSource): Env {
  const issues: string[] = [];

  let nodeEnv: NodeEnv = "development";
  const rawNodeEnv = source.NODE_ENV;
  if (rawNodeEnv !== undefined && rawNodeEnv !== "") {
    if ((NODE_ENVS as readonly string[]).includes(rawNodeEnv)) {
      nodeEnv = rawNodeEnv as NodeEnv;
    } else {
      issues.push(`NODE_ENV must be one of ${NODE_ENVS.join(", ")} (received "${rawNodeEnv}").`);
    }
  }

  let port = 3000;
  const rawPort = source.PORT;
  if (rawPort !== undefined && rawPort !== "") {
    const parsed = Number(rawPort);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
      issues.push(`PORT must be an integer between 1 and 65535 (received "${rawPort}").`);
    } else {
      port = parsed;
    }
  }

  const lspMaxConnections = parsePositiveInteger(
    source,
    "LSP_MAX_CONNECTIONS",
    DEFAULT_LSP_MAX_CONNECTIONS,
    10_000,
    issues,
  );
  const lspMaxConnectionsPerIp = parsePositiveInteger(
    source,
    "LSP_MAX_CONNECTIONS_PER_IP",
    DEFAULT_LSP_MAX_CONNECTIONS_PER_IP,
    10_000,
    issues,
  );
  const lspIdleTimeoutMs = parsePositiveInteger(
    source,
    "LSP_IDLE_TIMEOUT_MS",
    DEFAULT_LSP_IDLE_TIMEOUT_MS,
    2_147_483_647,
    issues,
  );

  let logLevel: LogLevel = nodeEnv === "test" ? "silent" : "info";
  const rawLogLevel = source.LOG_LEVEL;
  if (rawLogLevel !== undefined && rawLogLevel !== "") {
    if ((LOG_LEVELS as readonly string[]).includes(rawLogLevel)) {
      logLevel = rawLogLevel as LogLevel;
    } else {
      issues.push(`LOG_LEVEL must be one of ${LOG_LEVELS.join(", ")} (received "${rawLogLevel}").`);
    }
  }

  // Required in production (Better Auth trusted origins, absolute links); in
  // development/test it defaults to the local server origin for convenience.
  let publicAppUrl = `http://localhost:${port}`;
  const rawPublicAppUrl = source.PUBLIC_APP_URL;
  if (rawPublicAppUrl !== undefined && rawPublicAppUrl !== "") {
    if (isValidHttpUrl(rawPublicAppUrl)) {
      publicAppUrl = rawPublicAppUrl;
    } else {
      issues.push(`PUBLIC_APP_URL must be a valid http(s) URL (received "${rawPublicAppUrl}").`);
    }
  } else if (nodeEnv === "production") {
    issues.push("PUBLIC_APP_URL is required in production (e.g. https://codetype.example.com).");
  }

  // SQLite database file. Defaults to a gitignored local file for development;
  // production should point this at a durable volume (e.g. /data/codetype.sqlite).
  // Drizzle Kit reads the same variable for migrations (see drizzle.config.ts).
  let dbFileName = "./data/codetype.sqlite";
  const rawDbFileName = source.DB_FILE_NAME;
  if (rawDbFileName !== undefined && rawDbFileName !== "") {
    dbFileName = rawDbFileName;
  } else if (nodeEnv === "production") {
    issues.push("DB_FILE_NAME is required in production (e.g. /data/codetype.sqlite).");
  }

  if (issues.length > 0) {
    throw new EnvError(issues);
  }

  return Object.freeze({
    NODE_ENV: nodeEnv,
    PORT: port,
    LOG_LEVEL: logLevel,
    PUBLIC_APP_URL: publicAppUrl,
    LSP_MAX_CONNECTIONS: lspMaxConnections,
    LSP_MAX_CONNECTIONS_PER_IP: lspMaxConnectionsPerIp,
    LSP_IDLE_TIMEOUT_MS: lspIdleTimeoutMs,
    DB_FILE_NAME: dbFileName,
  });
}
