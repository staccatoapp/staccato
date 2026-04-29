import { eq } from "drizzle-orm";
import { SQLiteUpdateSetSource } from "drizzle-orm/sqlite-core";
import { db } from "../client.js";
import { userSettings } from "../schema/user-settings.js";

export type UserSettingsRow = typeof userSettings.$inferSelect;
export type UserSettingsUpdate = SQLiteUpdateSetSource<typeof userSettings>;

export function getOrCreateUserSettings(userId: string): UserSettingsRow {
  return db
    .insert(userSettings)
    .values({ userId })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: { userId },
    })
    .returning()
    .get()!;
}

export function updateUserSettings(
  userId: string,
  data: UserSettingsUpdate,
): void {
  db.update(userSettings).set(data).where(eq(userSettings.userId, userId)).run();
}

export function getUserListenbrainzToken(userId: string): string | null {
  const result = db
    .select({ listenbrainzToken: userSettings.listenbrainzToken })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .get();
  return result?.listenbrainzToken ?? null;
}
