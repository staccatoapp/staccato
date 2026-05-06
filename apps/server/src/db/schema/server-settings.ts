import { createId } from "@paralleldrive/cuid2";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const serverSettings = sqliteTable("server_settings", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  lidarrUrl: text("lidarr_url"),
  lidarrApiKey: text("lidarr_api_key"),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
});
