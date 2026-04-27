// TODO - consider basic CRUD instead of a new method for every variation of return type. much simpler for negligible additional memory
import { and, count, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "../client.js";
import { tracks } from "../schema/tracks.js";
import { SQLiteUpdateSetSource } from "drizzle-orm/sqlite-core";
import { artists } from "../schema/artists.js";
import { albums } from "../schema/albums.js";

export function getUnresolvedTracksByAlbum(albumId: string) {
  return db
    .select({
      id: tracks.id,
      title: tracks.title,
      trackNumber: tracks.trackNumber,
      discNumber: tracks.discNumber,
    })
    .from(tracks)
    .where(and(eq(tracks.albumId, albumId), isNull(tracks.musicbrainzId)))
    .all();
}
export type UnresolvedTrackInAlbumRow = ReturnType<
  typeof getUnresolvedTracksByAlbum
>[number];

export function getUnresolvedTracksWithAlbumAndArtistDetails() {
  return db
    .select({
      trackId: tracks.id,
      title: tracks.title,
      albumId: tracks.albumId,
      artistId: tracks.artistId,
      artistName: artists.name,
      albumTitle: albums.title,
      releaseYear: albums.releaseYear,
    })
    .from(tracks)
    .innerJoin(artists, eq(tracks.artistId, artists.id))
    .leftJoin(albums, eq(tracks.albumId, albums.id))
    .where(isNull(tracks.musicbrainzId))
    .all();
}
export type UnresolvedTrackWithAlbumAndArtistDetailsRow = ReturnType<
  typeof getUnresolvedTracksWithAlbumAndArtistDetails
>[number];

export function getUnresolvedTracksPendingFingerprint() {
  return db
    .select({ trackId: tracks.id, filePath: tracks.filePath })
    .from(tracks)
    .where(
      and(
        isNull(tracks.musicbrainzId),
        eq(tracks.fingerprintStatus, "pending"),
      ),
    )
    .all();
}
export type UnresolvedTrackPendingFingerprint = ReturnType<
  typeof getUnresolvedTracksPendingFingerprint
>[number];

export function getResolvedTrackMbidsByAlbumId(albumId: string) {
  return db
    .select({ musicbrainzId: tracks.musicbrainzId })
    .from(tracks)
    .where(and(eq(tracks.albumId, albumId), isNotNull(tracks.musicbrainzId)))
    .all()
    .map((t) => t.musicbrainzId!);
}
export type ResolvedTrackMbidByAlbumId = ReturnType<
  typeof getResolvedTrackMbidsByAlbumId
>[number];

export function updateTrackByTrackId(
  trackId: string,
  trackUpdate: TrackUpdate,
): void {
  updateTrackBaseQuery(trackUpdate).where(eq(tracks.id, trackId)).run();
}

export function updateTrackByArtistId(
  artistId: string,
  trackUpdate: TrackUpdate,
): void {
  updateTrackBaseQuery(trackUpdate).where(eq(tracks.artistId, artistId)).run();
}

export function updateTrackByAlbumId(
  albumId: string,
  trackUpdate: TrackUpdate,
): void {
  updateTrackBaseQuery(trackUpdate).where(eq(tracks.albumId, albumId)).run();
}

function updateTrackBaseQuery(trackUpdate: TrackUpdate) {
  return db.update(tracks).set(trackUpdate);
}
export type TrackUpdate = SQLiteUpdateSetSource<typeof tracks>;

export function countUnresolvedTracks(): number {
  const result = db
    .select({ count: count() })
    .from(tracks)
    .where(isNull(tracks.musicbrainzId))
    .get();
  return result?.count || 0;
}
