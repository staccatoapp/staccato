import { createId } from "@paralleldrive/cuid2";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { users } from "./users.js";

export const authTokens = sqliteTable("auth_tokens", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  // SHA-256 hex digest of the opaque bearer token; the raw token is never stored
  tokenHash: text("token_hash").notNull().unique(),
  deviceName: text("device_name"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
  lastUsedAt: integer("last_used_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
  // Reserved for future expiry enforcement; not checked yet
  expiresAt: integer("expires_at", { mode: "timestamp" }),
});

export type AuthTokenRow = typeof authTokens.$inferSelect;
export type NewAuthTokenRow = typeof authTokens.$inferInsert;
