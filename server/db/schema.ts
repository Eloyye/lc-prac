import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Database schema for Better Auth and the Problem Library. Per-user bundled
 * personalization lives in the Override and Tombstone tables below. History
 * (Attempts, Personal Bests) lands in a later phase, while the columns reserved
 * for custom ownership (`ownerUserId`, `archivedAtMs`) stay null for bundled
 * rows.
 *
 * See docs/BACKEND_INTEGRATION_SPEC.md §8 for the full target schema.
 */

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).default(false).notNull(),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => new Date())
    .notNull(),
});

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
    scope: text("scope"),
    password: text("password"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const problems = sqliteTable(
  "problems",
  {
    // Stable logical id used in routes (`/problems/:id`) and Attempts. Matches the
    // bundled content's authored id (e.g. `two-sum`) so deep links never change.
    id: text("id").primaryKey(),
    slug: text("slug").unique(),
    title: text("title").notNull(),
    difficulty: text("difficulty", { enum: ["easy", "medium", "hard"] }).notNull(),
    origin: text("origin", { enum: ["bundled", "custom"] }).notNull(),
    // Null for bundled rows; custom rows carry the owning account id.
    ownerUserId: text("owner_user_id"),
    url: text("url"),
    statement: text("statement"),
    expectedTime: text("expected_time"),
    expectedSpace: text("expected_space"),
    // Set when a custom Problem is archived out of the active Library.
    archivedAtMs: integer("archived_at_ms"),
    createdAtMs: integer("created_at_ms").notNull(),
    updatedAtMs: integer("updated_at_ms").notNull(),
  },
  (table) => [index("problems_owner_user_id_idx").on(table.ownerUserId)],
);

export const solutions = sqliteTable("solutions", {
  id: text("id").primaryKey(),
  problemId: text("problem_id")
    .notNull()
    .references(() => problems.id, { onDelete: "cascade" }),
  lang: text("lang", { enum: ["python"] }).notNull(),
  approach: text("approach").notNull(),
  // The Reference the user retypes; never logged (see logger redaction).
  code: text("code").notNull(),
  timeComplexity: text("time_complexity"),
  spaceComplexity: text("space_complexity"),
  // Preserves the authored variant ordering (optimal before brute-force, etc.).
  sortOrder: integer("sort_order").notNull().default(0),
  createdAtMs: integer("created_at_ms").notNull(),
  updatedAtMs: integer("updated_at_ms").notNull(),
});

export const problemExamples = sqliteTable("problem_examples", {
  id: text("id").primaryKey(),
  problemId: text("problem_id")
    .notNull()
    .references(() => problems.id, { onDelete: "cascade" }),
  input: text("input").notNull(),
  output: text("output").notNull(),
  explanation: text("explanation"),
  // Preserves the authored display order of the examples.
  sortOrder: integer("sort_order").notNull().default(0),
});

export const tags = sqliteTable("tags", {
  id: text("id").primaryKey(),
  // Normalized lowercase tag shared across Problems, e.g. `hash-map`.
  name: text("name").notNull().unique(),
});

export const problemTags = sqliteTable(
  "problem_tags",
  {
    problemId: text("problem_id")
      .notNull()
      .references(() => problems.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    // Tags are an ordered list on a Problem (authored order is meaningful), so
    // the association carries its own sort order rather than relying on row
    // insertion order, which SQLite does not guarantee on read.
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.problemId, table.tagId] })],
);

export const problemOverrides = sqliteTable(
  "problem_overrides",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    bundledProblemId: text("bundled_problem_id")
      .notNull()
      .references(() => problems.id, { onDelete: "cascade" }),
    snapshotJson: text("snapshot_json").notNull(),
    updatedAtMs: integer("updated_at_ms").notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.bundledProblemId] })],
);

export const problemTombstones = sqliteTable(
  "problem_tombstones",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    bundledProblemId: text("bundled_problem_id")
      .notNull()
      .references(() => problems.id, { onDelete: "cascade" }),
    hiddenAtMs: integer("hidden_at_ms").notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.bundledProblemId] })],
);

export type ProblemRow = typeof problems.$inferSelect;
export type SolutionRow = typeof solutions.$inferSelect;
export type ProblemExampleRow = typeof problemExamples.$inferSelect;
export type TagRow = typeof tags.$inferSelect;
