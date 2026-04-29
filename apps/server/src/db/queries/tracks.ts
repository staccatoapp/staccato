import {
  and,
  asc,
  count,
  eq,
  inArray,
  isNotNull,
  isNull,
  sql,
} from "drizzle-orm";
import { db } from "../client.js";
import { tracks } from "../schema/tracks.js";
import { SQLiteUpdateSetSource } from "drizzle-orm/sqlite-core";
import { artists } from "../schema/artists.js";
import { albums } from "../schema/albums.js";
import { PaginationOptions } from "@staccato/shared";

const resolvedTitle = sql<string>`COALESCE(${tracks.canonicalTitle}, ${tracks.title})`;
const resolvedArtistName = sql<string>`COALESCE(${artists.canonicalName}, ${artists.name})`;
const resolvedAlbumTitle = sql<string>`COALESCE(${albums.canonicalTitle}, ${albums.title})`;

export function getTracksInAlbum(albumId: string) {
  return db
    .select({
      id: tracks.id,
      title: tracks.title,
      trackNumber: tracks.trackNumber,
      discNumber: tracks.discNumber,
      durationSeconds: tracks.durationSeconds,
    })
    .from(tracks)
    .where(eq(tracks.albumId, albumId))
    .orderBy(asc(tracks.discNumber), asc(tracks.trackNumber))
    .all();
}
// Shape intentionally matches shared AlbumTrack type — keep in sync
export type TrackInAlbumRow = ReturnType<typeof getTracksInAlbum>[number];

export function getTrackForStream(
  id: string,
): { filePath: string; fileFormat: string | null } | undefined {
  return db
    .select({ filePath: tracks.filePath, fileFormat: tracks.fileFormat })
    .from(tracks)
    .where(eq(tracks.id, id))
    .get();
}

export type LibraryTrackRow = {
  id: string;
  title: string;
  artistId: string;
  artistName: string;
  albumId: string | null;
  albumTitle: string | null;
  coverArtUrl: string | null;
  durationSeconds: number | null;
  fileFormat: string | null;
};

export function getLibraryTracks(opts: PaginationOptions): LibraryTrackRow[] {
  return db
    .select({
      id: tracks.id,
      title: resolvedTitle,
      artistId: tracks.artistId,
      artistName: resolvedArtistName,
      albumId: tracks.albumId,
      albumTitle: resolvedAlbumTitle,
      coverArtUrl: albums.coverArtUrl,
      durationSeconds: tracks.durationSeconds,
      fileFormat: tracks.fileFormat,
    })
    .from(tracks)
    .innerJoin(artists, eq(tracks.artistId, artists.id))
    .leftJoin(albums, eq(tracks.albumId, albums.id))
    .orderBy(
      asc(sql`COALESCE(${artists.canonicalName}, ${artists.name})`),
      asc(sql`COALESCE(${albums.canonicalTitle}, ${albums.title})`),
      asc(tracks.discNumber),
      asc(tracks.trackNumber),
    )
    .limit(opts.limit)
    .offset(opts.offset)
    .all();
}

export function countTracks(): number {
  const result = db
    .select({ total: sql<number>`count(*)`.mapWith(Number) })
    .from(tracks)
    .get();
  return result?.total ?? 0;
}

export type PlaybackTrackRow = {
  id: string;
  title: string;
  trackNumber: number | null;
  discNumber: number | null;
  artistName: string | null;
  coverArtUrl: string | null;
  durationSeconds: number | null;
};

export function getPlaybackTracksByIds(ids: string[]): PlaybackTrackRow[] {
  if (ids.length === 0) return [];
  return db
    .select({
      id: tracks.id,
      title: resolvedTitle,
      trackNumber: tracks.trackNumber,
      discNumber: tracks.discNumber,
      artistName: resolvedArtistName,
      coverArtUrl: albums.coverArtUrl,
      durationSeconds: tracks.durationSeconds,
    })
    .from(tracks)
    .innerJoin(albums, eq(tracks.albumId, albums.id))
    .innerJoin(artists, eq(tracks.artistId, artists.id))
    .where(inArray(tracks.id, ids))
    .all();
}

export function getTrackForScrobble(id: string):
  | {
      title: string;
      artistName: string;
      musicbrainzId: string | null;
    }
  | undefined {
  return db
    .select({
      title: resolvedTitle,
      artistName: resolvedArtistName,
      musicbrainzId: tracks.musicbrainzId,
    })
    .from(tracks)
    .innerJoin(artists, eq(tracks.artistId, artists.id))
    .where(eq(tracks.id, id))
    .get();
}

export function getLocalTrackMbidsByMbids(mbids: string[]): string[] {
  if (mbids.length === 0) return [];
  return db
    .select({ musicbrainzId: tracks.musicbrainzId })
    .from(tracks)
    .where(inArray(tracks.musicbrainzId, mbids))
    .all()
    .map((r) => r.musicbrainzId!);
}

export function getTrackByFilePath(filePath: string):
  | {
      id: string;
      albumId: string | null;
      artistId: string;
    }
  | undefined {
  return db
    .select({
      id: tracks.id,
      albumId: tracks.albumId,
      artistId: tracks.artistId,
    })
    .from(tracks)
    .where(eq(tracks.filePath, filePath))
    .get();
}

export function getTrackSiblingInAlbum(
  albumId: string,
): { id: string } | undefined {
  return db
    .select({ id: tracks.id })
    .from(tracks)
    .where(eq(tracks.albumId, albumId))
    .limit(1)
    .get();
}

export function getTrackByArtist(artistId: string): { id: string } | undefined {
  return db
    .select({ id: tracks.id })
    .from(tracks)
    .where(eq(tracks.artistId, artistId))
    .limit(1)
    .get();
}

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

export function getResolvedTrackMbidsByAlbumId(albumId: string): string[] {
  return db
    .select({ musicbrainzId: tracks.musicbrainzId })
    .from(tracks)
    .where(and(eq(tracks.albumId, albumId), isNotNull(tracks.musicbrainzId)))
    .all()
    .map((t) => t.musicbrainzId!);
}

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
