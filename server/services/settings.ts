import { eq } from "drizzle-orm";
import type { SavedSettings, Settings } from "../../shared/types";
import type { Db } from "../db/client";
import { userSettings } from "../db/schema";

const DEFAULT_SETTINGS: Settings = { mode: "copy", distractionFree: false };

function serialize(row: typeof userSettings.$inferSelect): SavedSettings {
  return {
    mode: row.mode,
    distractionFree: row.distractionFree,
    updatedAt: new Date(row.updatedAtMs).toISOString(),
  };
}

/** Read Settings, creating the account's default row on first access. */
export function getSettings(db: Db, userId: string, now = Date.now()): SavedSettings {
  const existing = db.select().from(userSettings).where(eq(userSettings.userId, userId)).get();
  if (existing !== undefined) return serialize(existing);

  // Two fresh devices can request defaults concurrently. Let either create the
  // row, then read the single account-owned result instead of surfacing a PK
  // conflict to the loser.
  db.insert(userSettings)
    .values({ userId, ...DEFAULT_SETTINGS, updatedAtMs: now })
    .onConflictDoNothing()
    .run();
  const created = db.select().from(userSettings).where(eq(userSettings.userId, userId)).get();
  if (created === undefined) throw new Error("Failed to initialize account Settings.");
  return serialize(created);
}

/** Replace the complete synchronized Settings document for an account. */
export function replaceSettings(
  db: Db,
  userId: string,
  settings: Settings,
  now = Date.now(),
): SavedSettings {
  const saved = db
    .insert(userSettings)
    .values({ userId, ...settings, updatedAtMs: now })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: { ...settings, updatedAtMs: now },
    })
    .returning()
    .get();
  return serialize(saved);
}
