import { createId } from "@paralleldrive/cuid2";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const artists = sqliteTable(
  "artists",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    name: text("name").notNull().unique(),
    normalizedName: text("normalized_name"),
    canonicalName: text("canonical_name"),
    normalizedCanonicalName: text("normalized_canonical_name"),
    musicbrainzId: text("musicbrainz_id").unique(),
    imageUrl: text("image_url"),
    createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
      () => new Date(),
    ),
  },
  (table) => [
    index("artists_normalized_name_idx").on(table.normalizedName),
    index("artists_normalized_canonical_name_idx").on(
      table.normalizedCanonicalName,
    ),
  ],
);
