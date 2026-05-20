import { createId } from "@paralleldrive/cuid2";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const serverSettings = sqliteTable("server_settings", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  lidarrUrl: text("lidarr_url"),
  lidarrApiKey: text("lidarr_api_key"),
  lidarrQualityProfileId: integer("lidarr_quality_profile_id"),
  lidarrMetadataProfileId: integer("lidarr_metadata_profile_id"),
  lidarrRootFolderPath: text("lidarr_root_folder_path"),
  metadataConfidenceThreshold: real("metadata_confidence_threshold")
    .notNull()
    .default(0.75),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
    () => new Date(),
  ),
});
