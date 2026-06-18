import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import BetterSqlite3 from "better-sqlite3";
import type { Database as Sqlite } from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

/** Drizzle query interface bound to the app schema. */
export type Db = BetterSQLite3Database<typeof schema>;

export type DbConnection = {
  readonly db: Db;
  /** The underlying better-sqlite3 handle, for migrations and explicit close. */
  readonly sqlite: Sqlite;
  /** Close the connection. Safe to call once at shutdown or after a test. */
  readonly close: () => void;
};

/**
 * Open a SQLite connection with the operational pragmas the spec requires and
 * return a Drizzle instance bound to the app schema.
 *
 * - `foreign_keys = ON` enforces the cascade relationships in the schema.
 * - `journal_mode = WAL` gives better read concurrency on the file (a no-op for
 *   an in-memory database, which tests use).
 * - `busy_timeout` lets a writer wait briefly instead of failing immediately
 *   under contention.
 *
 * Pass `":memory:"` for an ephemeral database (integration tests). For a file
 * path the parent directory is created if missing so a default like
 * `./data/codetype.sqlite` works without a manual setup step.
 */
export function openDatabase(fileName: string): DbConnection {
  if (fileName !== ":memory:") {
    mkdirSync(dirname(fileName), { recursive: true });
  }

  const sqlite = new BetterSqlite3(fileName);
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");

  const db = drizzle(sqlite, { schema });

  return {
    db,
    sqlite,
    close: () => sqlite.close(),
  };
}
