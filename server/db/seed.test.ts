import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { PROBLEMS } from "../../src/content/problems";
import { getProblem, listProblems } from "../services/problems";
import { openDatabase } from "./client";
import type { DbConnection } from "./client";
import { runMigrations } from "./migrate";
import { problemExamples, problems, problemTags, solutions, tags } from "./schema";
import { seedBundledProblems } from "./seed";

let conn: DbConnection;

beforeEach(() => {
  // A fresh in-memory database per test is a genuinely temporary store and runs
  // the same migrations and pragmas as production.
  conn = openDatabase(":memory:");
  runMigrations(conn.db);
});

afterEach(() => {
  conn.close();
});

describe("seedBundledProblems", () => {
  it("imports every bundled Problem with its stable logical id", () => {
    const count = seedBundledProblems(conn.db, PROBLEMS);

    expect(count).toBe(PROBLEMS.length);
    const ids = conn.db
      .select({ id: problems.id })
      .from(problems)
      .all()
      .map((row) => row.id)
      .sort();
    expect(ids).toEqual(PROBLEMS.map((p) => p.id).sort());
  });

  it("round-trips each Problem DTO exactly, preserving metadata and examples", () => {
    seedBundledProblems(conn.db, PROBLEMS);

    for (const original of PROBLEMS) {
      // Deep equality covers tags (and their order), Solutions, expected
      // complexity, and structured examples — and that absent optional fields
      // stay absent rather than becoming null/undefined keys.
      expect(getProblem(conn.db, original.id)).toEqual(original);
    }
  });

  it("preserves the authored Library order", () => {
    seedBundledProblems(conn.db, PROBLEMS);

    expect(listProblems(conn.db).problems.map((p) => p.id)).toEqual(PROBLEMS.map((p) => p.id));
  });

  it("is idempotent: re-seeding does not duplicate rows or change content", () => {
    seedBundledProblems(conn.db, PROBLEMS);
    const before = {
      problems: conn.db.select().from(problems).all().length,
      solutions: conn.db.select().from(solutions).all().length,
      examples: conn.db.select().from(problemExamples).all().length,
      tags: conn.db.select().from(tags).all().length,
      problemTags: conn.db.select().from(problemTags).all().length,
    };

    seedBundledProblems(conn.db, PROBLEMS);
    const after = {
      problems: conn.db.select().from(problems).all().length,
      solutions: conn.db.select().from(solutions).all().length,
      examples: conn.db.select().from(problemExamples).all().length,
      tags: conn.db.select().from(tags).all().length,
      problemTags: conn.db.select().from(problemTags).all().length,
    };

    expect(after).toEqual(before);
    expect(listProblems(conn.db).problems).toEqual(PROBLEMS);
  });

  it("keeps createdAtMs (and Library order) stable across re-seeds while refreshing updatedAtMs", () => {
    seedBundledProblems(conn.db, PROBLEMS, 1_000);
    const first = conn.db.select().from(problems).where(eq(problems.id, "two-sum")).get();

    seedBundledProblems(conn.db, PROBLEMS, 9_000);
    const second = conn.db.select().from(problems).where(eq(problems.id, "two-sum")).get();

    expect(second?.createdAtMs).toBe(first?.createdAtMs);
    expect(second?.updatedAtMs).toBe(9_000);
  });
});
