import { z } from "zod";
import { AlbumListItemSchema } from "./albums.js";
import { ArtistSearchItemSchema } from "./artists.js";
import { TrackSearchResultSchema } from "./tracks.js";

export const LibrarySearchResultsSchema = z.object({
  artists: z.array(ArtistSearchItemSchema),
  albums: z.array(AlbumListItemSchema),
  tracks: z.array(TrackSearchResultSchema),
});
export type LibrarySearchResults = z.infer<typeof LibrarySearchResultsSchema>;
