import { eq, sql } from "drizzle-orm";
import { db } from "../client.js";
import { trackLyrics } from "../schema/track-lyrics.js";
import { tracks } from "../schema/tracks.js";
import { artists } from "../schema/artists.js";
import { albums } from "../schema/albums.js";
import type { NewTrackLyricsRow, TrackLyricsRow } from "../schema/track-lyrics.js";

export function getLyricsByTrackId(
  trackId: string,
): TrackLyricsRow | undefined {
  return db
    .select()
    .from(trackLyrics)
    .where(eq(trackLyrics.trackId, trackId))
    .get();
}

export function insertLyrics(data: NewTrackLyricsRow): TrackLyricsRow {
  return db.insert(trackLyrics).values(data).returning().get()!;
}

export type TrackMetaForLyrics = {
  artistName: string;
  trackTitle: string;
  albumTitle: string | null;
  durationSeconds: number | null;
};

export function getTrackMetaForLyrics(
  trackId: string,
): TrackMetaForLyrics | undefined {
  return db
    .select({
      artistName: sql<string>`COALESCE(${artists.canonicalName}, ${artists.name})`,
      trackTitle: sql<string>`COALESCE(${tracks.canonicalTitle}, ${tracks.title})`,
      albumTitle: sql<string | null>`COALESCE(${albums.canonicalTitle}, ${albums.title})`,
      durationSeconds: tracks.durationSeconds,
    })
    .from(tracks)
    .innerJoin(artists, eq(tracks.artistId, artists.id))
    .leftJoin(albums, eq(tracks.albumId, albums.id))
    .where(eq(tracks.id, trackId))
    .get();
}
