import { z } from "zod";

export const ArtistSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string().nullable(),
});

export const AlbumListItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  artistId: z.string(),
  artistName: z.string(),
  releaseYear: z.number().nullable(),
  coverArtUrl: z.string().nullable(),
  createdAt: z.string().nullable(),
});

export const TrackListItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  artistId: z.string(),
  artistName: z.string(),
  albumId: z.string().nullable(),
  albumTitle: z.string().nullable(),
  durationSeconds: z.number().nullable(),
  fileFormat: z.string().nullable(),
});

export const AlbumTrackSchema = z.object({
  id: z.string(),
  title: z.string(),
  trackNumber: z.number().nullable(),
  discNumber: z.number().nullable(),
  durationSeconds: z.number().nullable(),
});

export const AlbumDetailSchema = z.object({
  album: AlbumListItemSchema,
  tracks: z.array(AlbumTrackSchema),
});

export const PaginatedSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    total: z.number(),
  });

export type Artist = z.infer<typeof ArtistSchema>;
export type AlbumListItem = z.infer<typeof AlbumListItemSchema>;
export type TrackListItem = z.infer<typeof TrackListItemSchema>;
export type AlbumTrack = z.infer<typeof AlbumTrackSchema>;
export type AlbumDetail = z.infer<typeof AlbumDetailSchema>;
export type Paginated<T> = { items: T[]; total: number };
