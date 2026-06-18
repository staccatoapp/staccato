import { z } from "zod";

/**
 * One recently-played entry — either an album or an in-library playlist. The
 * `kind` discriminator lets clients render the right card and open the right
 * detail screen. `lastPlayedAt` is unix epoch **milliseconds** of the most
 * recent listen attributed to this source, used only for ordering.
 */
export const RecentlyPlayedAlbumSchema = z.object({
  kind: z.literal("album"),
  id: z.string(),
  title: z.string(),
  artistName: z.string(),
  releaseYear: z.number().nullable(),
  coverArtUrl: z.string().nullable(),
  lastPlayedAt: z.number(),
});
export type RecentlyPlayedAlbum = z.infer<typeof RecentlyPlayedAlbumSchema>;

export const RecentlyPlayedPlaylistSchema = z.object({
  kind: z.literal("playlist"),
  id: z.string(),
  name: z.string(),
  trackCount: z.number(),
  coverArtUrls: z.array(z.string()),
  lastPlayedAt: z.number(),
});
export type RecentlyPlayedPlaylist = z.infer<
  typeof RecentlyPlayedPlaylistSchema
>;

export const RecentlyPlayedItemSchema = z.discriminatedUnion("kind", [
  RecentlyPlayedAlbumSchema,
  RecentlyPlayedPlaylistSchema,
]);
export type RecentlyPlayedItem = z.infer<typeof RecentlyPlayedItemSchema>;

export const RecentlyPlayedResponseSchema = z.object({
  items: z.array(RecentlyPlayedItemSchema),
});
export type RecentlyPlayedResponse = z.infer<
  typeof RecentlyPlayedResponseSchema
>;
