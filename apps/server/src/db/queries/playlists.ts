import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { SQLiteUpdateSetSource } from "drizzle-orm/sqlite-core";
import { db } from "../client.js";
import { playlists } from "../schema/playlists.js";
import { playlistTracks } from "../schema/playlist-tracks.js";
import { tracks } from "../schema/tracks.js";
import { albums } from "../schema/albums.js";
import { artists } from "../schema/artists.js";

export type PlaylistRow = typeof playlists.$inferSelect;
export type PlaylistInsert = typeof playlists.$inferInsert;
export type PlaylistUpdate = SQLiteUpdateSetSource<typeof playlists>;

export type PlaylistTrackEntryRow = typeof playlistTracks.$inferSelect;

export type PlaylistTrackRow = {
  entryId: string;
  trackId: string;
  title: string;
  artistName: string;
  albumTitle: string;
  albumId: string;
  coverArtUrl: string | null;
  durationSeconds: number | null;
  trackNumber: number | null;
  position: number;
};

export function getUserPlaylists(userId: string): PlaylistRow[] {
  return db
    .select()
    .from(playlists)
    .where(eq(playlists.userId, userId))
    .orderBy(desc(playlists.updatedAt))
    .all();
}

export function getPlaylist(id: string): PlaylistRow | undefined {
  return db.select().from(playlists).where(eq(playlists.id, id)).get();
}

export function createPlaylist(data: PlaylistInsert): PlaylistRow {
  return db.insert(playlists).values(data).returning().get()!;
}

export function updatePlaylist(
  id: string,
  data: PlaylistUpdate,
): PlaylistRow | undefined {
  return db
    .update(playlists)
    .set(data)
    .where(eq(playlists.id, id))
    .returning()
    .get();
}

export function deletePlaylist(id: string): void {
  db.delete(playlists).where(eq(playlists.id, id)).run();
}

export function deletePlaylistTracks(playlistId: string): void {
  db.delete(playlistTracks)
    .where(eq(playlistTracks.playlistId, playlistId))
    .run();
}

export function getPlaylistTrackCounts(
  playlistIds: string[],
): { playlistId: string; trackCount: number }[] {
  if (playlistIds.length === 0) return [];
  return db
    .select({
      playlistId: playlistTracks.playlistId,
      trackCount: sql<number>`count(*)`,
    })
    .from(playlistTracks)
    .where(inArray(playlistTracks.playlistId, playlistIds))
    .groupBy(playlistTracks.playlistId)
    .all();
}

export function getPlaylistCoverArtUrls(
  playlistIds: string[],
): { playlistId: string; coverArtUrl: string | null; position: number }[] {
  if (playlistIds.length === 0) return [];
  return db
    .select({
      playlistId: playlistTracks.playlistId,
      coverArtUrl: albums.coverArtUrl,
      position: playlistTracks.position,
    })
    .from(playlistTracks)
    .innerJoin(tracks, eq(playlistTracks.trackId, tracks.id))
    .innerJoin(albums, eq(tracks.albumId, albums.id))
    .where(inArray(playlistTracks.playlistId, playlistIds))
    .orderBy(asc(playlistTracks.position))
    .all();
}

export function getPlaylistTracks(playlistId: string): PlaylistTrackRow[] {
  return db
    .select({
      entryId: playlistTracks.id,
      trackId: tracks.id,
      title: sql<string>`COALESCE(${tracks.canonicalTitle}, ${tracks.title})`,
      artistName: sql<string>`COALESCE(${artists.canonicalName}, ${artists.name})`,
      albumTitle: sql<string>`COALESCE(${albums.canonicalTitle}, ${albums.title})`,
      albumId: albums.id,
      coverArtUrl: albums.coverArtUrl,
      durationSeconds: tracks.durationSeconds,
      trackNumber: tracks.trackNumber,
      position: playlistTracks.position,
    })
    .from(playlistTracks)
    .innerJoin(tracks, eq(playlistTracks.trackId, tracks.id))
    .innerJoin(albums, eq(tracks.albumId, albums.id))
    .innerJoin(artists, eq(tracks.artistId, artists.id))
    .where(eq(playlistTracks.playlistId, playlistId))
    .orderBy(asc(playlistTracks.position))
    .all();
}

export function getMaxPlaylistTrackPosition(
  playlistId: string,
): number | null {
  const result = db
    .select({ maxPos: sql<number | null>`max(position)` })
    .from(playlistTracks)
    .where(eq(playlistTracks.playlistId, playlistId))
    .get();
  return result?.maxPos ?? null;
}

export function addTrackToPlaylist(
  playlistId: string,
  trackId: string,
  position: number,
): void {
  db.insert(playlistTracks).values({ playlistId, trackId, position }).run();
}

export function getPlaylistTrackEntry(
  entryId: string,
  playlistId: string,
): PlaylistTrackEntryRow | undefined {
  return db
    .select()
    .from(playlistTracks)
    .where(
      and(
        eq(playlistTracks.id, entryId),
        eq(playlistTracks.playlistId, playlistId),
      ),
    )
    .get();
}

export function removePlaylistTrackEntry(entryId: string): void {
  db.delete(playlistTracks).where(eq(playlistTracks.id, entryId)).run();
}

export function touchPlaylist(id: string): void {
  db.update(playlists)
    .set({ updatedAt: new Date() })
    .where(eq(playlists.id, id))
    .run();
}
