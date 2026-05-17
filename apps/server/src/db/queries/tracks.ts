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
import type { TrackTags } from "../../scanner/tags.js";
import { upsertTrackFts, deleteTrackFts } from "./tracks-fts.js";
import { getAlbumByArtist, deleteAlbum } from "./albums.js";
import { deleteArtist } from "./artists.js";

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
      recordingMbid: tracks.musicbrainzId,
    })
    .from(tracks)
    .where(eq(tracks.albumId, albumId))
    .orderBy(asc(tracks.discNumber), asc(tracks.trackNumber))
    .all();
}
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
  releaseGroupMbid: string | null;
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
      releaseGroupMbid: albums.releaseGroupMbid,
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
  albumId: string | null;
  releaseGroupMbid: string | null;
  coverArtUrl: string | null;
  durationSeconds: number | null;
};

export function getExistingTrackIds(ids: string[]): Set<string> {
  if (ids.length === 0) return new Set();
  const rows = db
    .select({ id: tracks.id })
    .from(tracks)
    .where(inArray(tracks.id, ids))
    .all();
  return new Set(rows.map((r) => r.id));
}

export function getPlaybackTracksByIds(ids: string[]): PlaybackTrackRow[] {
  if (ids.length === 0) return [];
  return db
    .select({
      id: tracks.id,
      title: resolvedTitle,
      trackNumber: tracks.trackNumber,
      discNumber: tracks.discNumber,
      artistName: resolvedArtistName,
      albumId: albums.id,
      releaseGroupMbid: albums.releaseGroupMbid,
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

export type LocalTrackDetail = {
  title: string;
  artistName: string;
  albumTitle: string | null;
  releaseGroupMbid: string | null;
  coverArtUrl: string | null;
  durationMs: number | null;
};

export function getTrackByMusicbrainzId(
  recordingMbid: string,
): LocalTrackDetail | undefined {
  const row = db
    .select({
      title: resolvedTitle,
      artistName: resolvedArtistName,
      albumTitle: resolvedAlbumTitle,
      releaseGroupMbid: albums.releaseGroupMbid,
      coverArtUrl: albums.coverArtUrl,
      durationSeconds: tracks.durationSeconds,
    })
    .from(tracks)
    .innerJoin(artists, eq(tracks.artistId, artists.id))
    .leftJoin(albums, eq(tracks.albumId, albums.id))
    .where(eq(tracks.musicbrainzId, recordingMbid))
    .get();
  if (!row) return undefined;
  return {
    title: row.title,
    artistName: row.artistName,
    albumTitle: row.albumTitle,
    releaseGroupMbid: row.releaseGroupMbid,
    coverArtUrl: row.coverArtUrl,
    durationMs: row.durationSeconds != null ? row.durationSeconds * 1000 : null,
  };
}

export function getTracksByMusicbrainzIds(
  recordingMbids: string[],
): Map<string, LocalTrackDetail> {
  const result = new Map<string, LocalTrackDetail>();
  if (recordingMbids.length === 0) return result;
  const rows = db
    .select({
      mbid: tracks.musicbrainzId,
      title: resolvedTitle,
      artistName: resolvedArtistName,
      albumTitle: resolvedAlbumTitle,
      releaseGroupMbid: albums.releaseGroupMbid,
      coverArtUrl: albums.coverArtUrl,
      durationSeconds: tracks.durationSeconds,
    })
    .from(tracks)
    .innerJoin(artists, eq(tracks.artistId, artists.id))
    .leftJoin(albums, eq(tracks.albumId, albums.id))
    .where(inArray(tracks.musicbrainzId, recordingMbids))
    .all();
  for (const row of rows) {
    if (!row.mbid) continue;
    result.set(row.mbid, {
      title: row.title,
      artistName: row.artistName,
      albumTitle: row.albumTitle,
      releaseGroupMbid: row.releaseGroupMbid,
      coverArtUrl: row.coverArtUrl,
      durationMs:
        row.durationSeconds != null ? row.durationSeconds * 1000 : null,
    });
  }
  return result;
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
    .where(eq(tracks.resolutionStatus, "pending"))
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
        eq(tracks.resolutionStatus, "pending"),
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
    .where(eq(tracks.resolutionStatus, "pending"))
    .get();
  return result?.count || 0;
}

export function getPendingTracksWithFullMbidTags() {
  return db
    .select({ id: tracks.id, musicbrainzId: tracks.musicbrainzId })
    .from(tracks)
    .innerJoin(albums, eq(tracks.albumId, albums.id))
    .where(
      and(
        eq(tracks.resolutionStatus, "pending"),
        isNotNull(tracks.musicbrainzId),
        isNotNull(albums.releaseGroupMbid),
      ),
    )
    .all();
}

export function markRemainingPendingAsFailed(): void {
  db.update(tracks)
    .set({ resolutionStatus: "failed" })
    .where(eq(tracks.resolutionStatus, "pending"))
    .run();
}

export function getAllTrackFilePaths(): string[] {
  return db
    .select({ filePath: tracks.filePath })
    .from(tracks)
    .all()
    .map((r) => r.filePath);
}

export function upsertTrack(
  tags: TrackTags,
  filePath: string,
  artistId: string,
  albumId: string | null,
): void {
  const mbFields = tags.mbRecordingId
    ? ({ musicbrainzId: tags.mbRecordingId, fingerprintStatus: "matched" } as const)
    : {};

  const insertedTrack = db
    .insert(tracks)
    .values({
      title: tags.title,
      artistId,
      albumId,
      trackNumber: tags.trackNumber,
      discNumber: tags.discNumber,
      durationSeconds: tags.durationSeconds,
      filePath,
      fileFormat: tags.fileFormat,
      fileSizeBytes: tags.fileSizeBytes,
      musicbrainzId: tags.mbRecordingId ?? null,
      fingerprintStatus: tags.mbRecordingId ? "matched" : "pending",
      resolutionStatus: "pending",
    })
    .onConflictDoUpdate({
      target: tracks.filePath,
      set: {
        title: tags.title,
        artistId,
        albumId,
        trackNumber: tags.trackNumber,
        discNumber: tags.discNumber,
        durationSeconds: tags.durationSeconds,
        fileFormat: tags.fileFormat,
        fileSizeBytes: tags.fileSizeBytes,
        ...mbFields,
      },
    })
    .returning({ id: tracks.id })
    .get()!;

  upsertTrackFts(insertedTrack.id, tags.title, tags.artistName, tags.albumTitle ?? "");
}

export function deleteTrackByPath(filePath: string): void {
  const track = getTrackByFilePath(filePath);
  if (!track) return;

  deleteTrackFts(track.id);
  db.delete(tracks).where(eq(tracks.id, track.id)).run();

  if (track.albumId) {
    const sibling = getTrackSiblingInAlbum(track.albumId);
    if (!sibling) {
      deleteAlbum(track.albumId);
    }
  }

  const artistTrack = getTrackByArtist(track.artistId);
  const artistAlbum = getAlbumByArtist(track.artistId);
  if (!artistTrack && !artistAlbum) {
    deleteArtist(track.artistId);
  }
}
