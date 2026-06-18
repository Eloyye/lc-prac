import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit configuration for the SQLite app schema. `db:generate` reads the
 * schema and writes versioned SQL into `drizzle/`; `db:migrate`/`db:studio`
 * additionally need the database file. The default mirrors `server/env.ts` so
 * the tooling and the running server agree on the file when DB_FILE_NAME is
 * unset in development.
 */
export default defineConfig({
  schema: "./server/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.DB_FILE_NAME ?? "./data/codetype.sqlite",
  },
});
