import { eq } from "drizzle-orm";
import { db } from "../client.js";
import { serverSettings } from "../schema/server-settings.js";
import { SQLiteUpdateSetSource } from "drizzle-orm/sqlite-core";

export type ServerSettingsRow = typeof serverSettings.$inferSelect;
export type ServerSettingsUpdate = SQLiteUpdateSetSource<typeof serverSettings>;

export function getOrCreateServerSettings(): ServerSettingsRow {
  const existing = db.select().from(serverSettings).get();
  if (existing) return existing;
  return db.insert(serverSettings).values({}).returning().get()!;
}

export function updateServerSettings(data: ServerSettingsUpdate): ServerSettingsRow {
  const settings = getOrCreateServerSettings();
  return db
    .update(serverSettings)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(serverSettings.id, settings.id))
    .returning()
    .get()!;
}
