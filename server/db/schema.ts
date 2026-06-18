import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * App-owned schema for the database-backed Problem Library. This first slice
 * covers the bundled content surface only — canonical Problems, their Solutions,
 * worked examples, and tags. Per-user personalization (Overrides, Tombstones)
 * and history (Attempts, Personal Bests) land with authentication in a later
 * phase, so the columns reserved for them (`ownerUserId`, `archivedAtMs`) stay
 * null for bundled rows but are defined now to keep this the canonical table.
 *
 * See docs/BACKEND_INTEGRATION_SPEC.md §8 for the full target schema.
 */

export const problems = sqliteTable("problems", {
  // Stable logical id used in routes (`/problems/:id`) and Attempts. Matches the
  // bundled content's authored id (e.g. `two-sum`) so deep links never change.
  id: text("id").primaryKey(),
  slug: text("slug").unique(),
  title: text("title").notNull(),
  difficulty: text("difficulty", { enum: ["easy", "medium", "hard"] }).notNull(),
  origin: text("origin", { enum: ["bundled", "custom"] }).notNull(),
  // Null for bundled rows; the owning user id for custom rows (future phase).
  ownerUserId: text("owner_user_id"),
  url: text("url"),
  statement: text("statement"),
  expectedTime: text("expected_time"),
  expectedSpace: text("expected_space"),
  // Set when a custom Problem is archived out of the active Library (future).
  archivedAtMs: integer("archived_at_ms"),
  createdAtMs: integer("created_at_ms").notNull(),
  updatedAtMs: integer("updated_at_ms").notNull(),
});

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

export type ProblemRow = typeof problems.$inferSelect;
export type SolutionRow = typeof solutions.$inferSelect;
export type ProblemExampleRow = typeof problemExamples.$inferSelect;
export type TagRow = typeof tags.$inferSelect;
