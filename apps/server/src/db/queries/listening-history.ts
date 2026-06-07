import { eq, sql } from "drizzle-orm";
import { db } from "../client.js";
import { listeningHistory } from "../schema/listening-history.js";
import { albums } from "../schema/albums.js";
import { artists } from "../schema/artists.js";
import { tracks } from "../schema/tracks.js";

export type ListenHistoryRow = typeof listeningHistory.$inferSelect;

export function insertListenEvent(
  userId: string,
  trackId: string,
): ListenHistoryRow {
  return db
    .insert(listeningHistory)
    .values({ userId, trackId })
    .returning()
    .get()!;
}

export interface ListenAggregate {
  trackId: string;
  recordingMbid: string | null;
  title: string;
  artistName: string;
  artistMbid: string | null;
  albumId: string | null;
  albumTitle: string | null;
  releaseGroupMbid: string | null;
  releaseYear: number | null;
  playCount: number;
  lastListenedAtMs: number;
}

/** Per-track listen aggregates for one user, joined with track/artist/album
 * metadata. `lastListenedAtMs` is converted from the stored unix **seconds**
 * to **ms**. This is the first read of `listening_history`. */
export function getListenAggregatesForUser(userId: string): ListenAggregate[] {
  return db
    .select({
      trackId: tracks.id,
      recordingMbid: tracks.musicbrainzId,
      title: tracks.title,
      artistName: artists.name,
      artistMbid: artists.musicbrainzId,
      albumId: albums.id,
      albumTitle: albums.title,
      releaseGroupMbid: albums.releaseGroupMbid,
      releaseYear: albums.releaseYear,
      playCount: sql<number>`count(*)`,
      lastListenedAtMs: sql<number>`max(${listeningHistory.listenedAt}) * 1000`,
    })
    .from(listeningHistory)
    .innerJoin(tracks, eq(listeningHistory.trackId, tracks.id))
    .innerJoin(artists, eq(tracks.artistId, artists.id))
    .leftJoin(albums, eq(tracks.albumId, albums.id))
    .where(eq(listeningHistory.userId, userId))
    .groupBy(tracks.id)
    .all();
}
