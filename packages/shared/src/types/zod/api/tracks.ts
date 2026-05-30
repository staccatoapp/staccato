import { z } from "zod";
import { TrackArtistCreditSchema } from "./credits.js";

export const TrackListItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  artistId: z.string(),
  artistName: z.string(),
  albumId: z.string().nullable(),
  albumTitle: z.string().nullable(),
  coverArtUrl: z.string().nullable(),
  durationSeconds: z.number().nullable(),
  fileFormat: z.string().nullable(),
  artists: z.array(TrackArtistCreditSchema),
});
export type TrackListItem = z.infer<typeof TrackListItemSchema>;

export const TrackSearchResultSchema = TrackListItemSchema.omit({
  artistId: true,
  fileFormat: true,
});
export type TrackSearchResult = z.infer<typeof TrackSearchResultSchema>;
