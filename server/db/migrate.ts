import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import type { Db } from "./client";

/** Absolute path to the generated migrations folder (repo-root `drizzle/`). */
const MIGRATIONS_FOLDER = fileURLToPath(new URL("../../drizzle", import.meta.url));

/**
 * Apply all pending migrations to the connection. Idempotent: Drizzle records
 * applied migrations in its own table and skips them on the next run, so this is
 * safe to call on every server boot and at the start of each integration test.
 */
export function runMigrations(db: Db): void {
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}
