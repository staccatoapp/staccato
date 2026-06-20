import path from "node:path";
import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  lt,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { db } from "../client.js";
import { tracks } from "../schema/tracks.js";
import type { ResolutionMethod, ResolutionStatus } from "../schema/tracks.js";
import { SQLiteUpdateSetSource } from "drizzle-orm/sqlite-core";
import { artists } from "../schema/artists.js";
import { albums } from "../schema/albums.js";
import { PaginationOptions } from "@staccato/shared";
import { upsertTrackFts, deleteTrackFts } from "./tracks-fts.js";
import { getAlbumByArtist, deleteAlbum } from "./albums.js";
import { deleteArtist } from "./artists.js";

const resolvedTitle = sql<string>`COALESCE(${tracks.canonicalTitle}, ${tracks.title})`;
const resolvedArtistName = sql<string>`COALESCE(${artists.canonicalName}, ${artists.name})`;
const resolvedAlbumTitle = sql<string>`COALESCE(${albums.canonicalTitle}, ${albums.title})`;

/**
 * The container extension of a source audio file (lowercase, no dot), or null
 * when the path carries none. This is the *real* container the file lives in —
 * unlike `tracks.fileFormat`, which is a codec label (`vorbis`/`alac`/`aac`)
 * unsuitable as a download filename extension. The `/stream` route serves bytes
 * verbatim, so a download is a byte-for-byte copy and its correct extension is
 * simply the source file's own. Derived in the query so the path itself is never
 * exposed to clients.
 */
export function fileExtensionFromPath(filePath: string): string | null {
  return path.extname(filePath).slice(1).toLowerCase() || null;
}

export function getTracksInAlbum(albumId: string) {
  return db
    .select({
      id: tracks.id,
      title: tracks.title,
      trackNumber: tracks.trackNumber,
      discNumber: tracks.discNumber,
      durationSeconds: tracks.durationSeconds,
      recordingMbid: tracks.musicbrainzId,
      filePath: tracks.filePath,
    })
    .from(tracks)
    .where(eq(tracks.albumId, albumId))
    .orderBy(asc(tracks.discNumber), asc(tracks.trackNumber))
    .all()
    .map(({ filePath, ...rest }) => ({
      ...rest,
      fileExtension: fileExtensionFromPath(filePath),
    }));
}

// The album's primary artist = the most-frequent lead among its resolved
// tracks. Recomputed on every commit; the deterministic tiebreak (lowest
// artist_id — cuid2 ids are monotonic, so oldest row wins) makes the final
// value order-independent regardless of the order tracks resolve in.
export function getDominantArtistIdForAlbum(albumId: string): string | null {
  const row = db
    .select({ artistId: tracks.artistId })
    .from(tracks)
    .where(
      and(eq(tracks.albumId, albumId), eq(tracks.resolutionStatus, "resolved")),
    )
    .groupBy(tracks.artistId)
    .orderBy(desc(count()), asc(tracks.artistId))
    .limit(1)
    .get();
  return row?.artistId ?? null;
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
  albumTitle: string | null;
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
      albumTitle: resolvedAlbumTitle,
      releaseGroupMbid: albums.releaseGroupMbid,
      coverArtUrl: albums.coverArtUrl,
      durationSeconds: tracks.durationSeconds,
    })
    .from(tracks)
    .leftJoin(albums, eq(tracks.albumId, albums.id))
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
  trackId: string;
  title: string;
  artistName: string;
  artistMbid: string | null;
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
      trackId: tracks.id,
      title: resolvedTitle,
      artistName: resolvedArtistName,
      artistMbid: artists.musicbrainzId,
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
    trackId: row.trackId,
    title: row.title,
    artistName: row.artistName,
    artistMbid: row.artistMbid,
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
      trackId: tracks.id,
      mbid: tracks.musicbrainzId,
      title: resolvedTitle,
      artistName: resolvedArtistName,
      artistMbid: artists.musicbrainzId,
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
      trackId: row.trackId,
      title: row.title,
      artistName: row.artistName,
      artistMbid: row.artistMbid,
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
    .select({ musicbrainzId: sql<string>`${tracks.musicbrainzId}` })
    .from(tracks)
    .where(
      and(
        inArray(tracks.musicbrainzId, mbids),
        isNotNull(tracks.musicbrainzId),
      ),
    )
    .all()
    .map((r) => r.musicbrainzId);
}

export type LibrarySongRow = {
  trackId: string;
  artistMbid: string;
  title: string;
  canonicalTitle: string | null;
  durationMs: number | null;
};

/** All library tracks whose artist carries one of the given artist MBIDs, with
 * BOTH the raw file-tag title and the MusicBrainz canonical title. Backs the
 * recommendations' song-level in-library fallback (in-library.ts): when a
 * recommendation's recording MBID doesn't match the library exactly, we match on
 * (artistMbid, normalized title) instead — the library and external sources
 * routinely hold *different recordings of the same song*. Both titles are
 * returned because they can disagree (e.g. raw tag "3005" vs canonical
 * "V. 3005") and either may be the form the source used, so the matcher indexes
 * the track under each. */
export function getLibraryTracksByArtistMbids(
  artistMbids: string[],
): LibrarySongRow[] {
  if (artistMbids.length === 0) return [];
  return db
    .select({
      trackId: tracks.id,
      artistMbid: sql<string>`${artists.musicbrainzId}`,
      title: tracks.title,
      canonicalTitle: tracks.canonicalTitle,
      durationSeconds: tracks.durationSeconds,
    })
    .from(tracks)
    .innerJoin(artists, eq(tracks.artistId, artists.id))
    .where(inArray(artists.musicbrainzId, artistMbids))
    .all()
    .map((r) => ({
      trackId: r.trackId,
      artistMbid: r.artistMbid,
      title: r.title,
      canonicalTitle: r.canonicalTitle,
      durationMs: r.durationSeconds != null ? r.durationSeconds * 1000 : null,
    }));
}

export type TrackFullRow = typeof tracks.$inferSelect;

export function getTrackByFilePath(filePath: string): TrackFullRow | undefined {
  return db.select().from(tracks).where(eq(tracks.filePath, filePath)).get();
}

export function getTrackByFingerprint(
  fingerprint: string,
  excludeTrackId?: string,
): TrackFullRow | undefined {
  const where = excludeTrackId
    ? and(
        eq(tracks.audioFingerprint, fingerprint),
        sql`${tracks.id} != ${excludeTrackId}`,
      )
    : eq(tracks.audioFingerprint, fingerprint);
  return db.select().from(tracks).where(where).get();
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

export interface DiscoverTrackInput {
  filePath: string;
  title: string;
  artistId: string;
  albumId: string | null;
  trackNumber: number | null;
  discNumber: number | null;
  durationSeconds: number | null;
  fileFormat: string | null;
  fileSizeBytes: number | null;
  fileMtime: number | null;
  mbRecordingId: string | null;
}

// Insert-or-update a track row at file discovery time. Resolution status is
// reset to pending so the worker will pick it up. canonical/confidence/method
// fields are intentionally NOT touched here — those only change on commit
// from the resolver path.
export function upsertDiscoveredTrack(
  input: DiscoverTrackInput,
  rawArtistName: string,
  rawAlbumTitle: string | null,
): string {
  const inserted = db
    .insert(tracks)
    .values({
      title: input.title,
      artistId: input.artistId,
      albumId: input.albumId,
      trackNumber: input.trackNumber,
      discNumber: input.discNumber,
      durationSeconds: input.durationSeconds,
      filePath: input.filePath,
      fileFormat: input.fileFormat,
      fileSizeBytes: input.fileSizeBytes,
      fileMtime: input.fileMtime,
      musicbrainzId: input.mbRecordingId,
      resolutionStatus: "pending",
    })
    .onConflictDoUpdate({
      target: tracks.filePath,
      set: {
        title: input.title,
        artistId: input.artistId,
        albumId: input.albumId,
        trackNumber: input.trackNumber,
        discNumber: input.discNumber,
        durationSeconds: input.durationSeconds,
        fileFormat: input.fileFormat,
        fileSizeBytes: input.fileSizeBytes,
        fileMtime: input.fileMtime,
        pendingRemovalAt: null,
      },
    })
    .returning({ id: tracks.id })
    .get()!;

  upsertTrackFts(inserted.id, input.title, rawArtistName, rawAlbumTitle ?? "");
  return inserted.id;
}

export function markTrackResolving(trackId: string): void {
  db.update(tracks)
    .set({ resolutionStatus: "resolving" })
    .where(eq(tracks.id, trackId))
    .run();
}

export function markTrackResolved(
  trackId: string,
  fields: {
    musicbrainzId: string | null;
    canonicalTitle: string | null;
    confidenceScore: number;
    resolutionMethod: ResolutionMethod;
    audioFingerprint: string | null;
  },
): void {
  db.update(tracks)
    .set({
      ...fields,
      resolutionStatus: "resolved",
    })
    .where(eq(tracks.id, trackId))
    .run();
}

export function markTrackFailed(
  trackId: string,
  fields: {
    confidenceScore: number | null;
    audioFingerprint: string | null;
  },
): void {
  db.update(tracks)
    .set({
      ...fields,
      resolutionStatus: "failed",
    })
    .where(eq(tracks.id, trackId))
    .run();
}

export function setAudioFingerprint(
  trackId: string,
  fingerprint: string,
): void {
  db.update(tracks)
    .set({ audioFingerprint: fingerprint })
    .where(eq(tracks.id, trackId))
    .run();
}

export function repointTrackPath(
  trackId: string,
  newPath: string,
  fileMtime: number,
  fileSizeBytes: number,
): void {
  db.update(tracks)
    .set({
      filePath: newPath,
      fileMtime,
      fileSizeBytes,
      pendingRemovalAt: null,
    })
    .where(eq(tracks.id, trackId))
    .run();
}

export function markPendingRemovalByPath(filePath: string, at: number): void {
  db.update(tracks)
    .set({ pendingRemovalAt: at })
    .where(eq(tracks.filePath, filePath))
    .run();
}

export function markPendingRemovalByPaths(
  filePaths: string[],
  at: number,
): number {
  if (filePaths.length === 0) return 0;
  const result = db
    .update(tracks)
    .set({ pendingRemovalAt: at })
    .where(inArray(tracks.filePath, filePaths))
    .run();
  return result.changes;
}

export function clearPendingRemoval(trackId: string): void {
  db.update(tracks)
    .set({ pendingRemovalAt: null })
    .where(eq(tracks.id, trackId))
    .run();
}

export function getTracksPendingRemovalBefore(cutoff: number): TrackFullRow[] {
  return db
    .select()
    .from(tracks)
    .where(
      and(
        isNotNull(tracks.pendingRemovalAt),
        lt(tracks.pendingRemovalAt, cutoff),
      ),
    )
    .all();
}

export function getPendingRemovalRows(): TrackFullRow[] {
  return db
    .select()
    .from(tracks)
    .where(isNotNull(tracks.pendingRemovalAt))
    .all();
}

export function resetResolvingToPending(): number {
  const result = db
    .update(tracks)
    .set({ resolutionStatus: "pending" })
    .where(eq(tracks.resolutionStatus, "resolving"))
    .run();
  return result.changes;
}

export function getPendingTrackPaths(): Array<{
  id: string;
  filePath: string;
}> {
  return db
    .select({ id: tracks.id, filePath: tracks.filePath })
    .from(tracks)
    .where(eq(tracks.resolutionStatus, "pending"))
    .all();
}

export function getFailedTrackPaths(): Array<{ id: string; filePath: string }> {
  return db
    .select({ id: tracks.id, filePath: tracks.filePath })
    .from(tracks)
    .where(eq(tracks.resolutionStatus, "failed"))
    .all();
}

export function getLowConfidenceTrackPaths(
  threshold: number,
): Array<{ id: string; filePath: string }> {
  return db
    .select({ id: tracks.id, filePath: tracks.filePath })
    .from(tracks)
    .where(
      and(
        eq(tracks.resolutionStatus, "resolved"),
        sql`${tracks.confidenceScore} < ${threshold}`,
      ),
    )
    .all();
}

export function resetTracksToPending(trackIds: string[]): number {
  if (trackIds.length === 0) return 0;
  const result = db
    .update(tracks)
    .set({
      resolutionStatus: "pending" as ResolutionStatus,
      resolutionMethod: null,
      confidenceScore: null,
    })
    .where(inArray(tracks.id, trackIds))
    .run();
  return result.changes;
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

export function countTracksByStatus(): {
  pending: number;
  resolving: number;
  resolved: number;
  failed: number;
} {
  const rows = db
    .select({
      status: tracks.resolutionStatus,
      count: count(),
    })
    .from(tracks)
    .groupBy(tracks.resolutionStatus)
    .all();
  const out = { pending: 0, resolving: 0, resolved: 0, failed: 0 };
  for (const row of rows) {
    if (row.status in out) {
      (out as Record<string, number>)[row.status] = row.count;
    }
  }
  return out;
}

export function getAllTrackFilePaths(): string[] {
  return db
    .select({ filePath: tracks.filePath })
    .from(tracks)
    .all()
    .map((r) => r.filePath);
}

export function deleteTrackById(trackId: string): void {
  const track = db
    .select({
      id: tracks.id,
      albumId: tracks.albumId,
      artistId: tracks.artistId,
    })
    .from(tracks)
    .where(eq(tracks.id, trackId))
    .get();
  if (!track) return;

  db.transaction(() => {
    deleteTrackFts(trackId);
    db.delete(tracks).where(eq(tracks.id, trackId)).run();

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
  });
}

export function deleteTrackByPath(filePath: string): void {
  const track = db
    .select({ id: tracks.id })
    .from(tracks)
    .where(eq(tracks.filePath, filePath))
    .get();
  if (!track) return;
  deleteTrackById(track.id);
}

// Legacy compatibility export — read pending tracks with album/artist context.
// Kept so retry endpoints and external callers continue to compile.
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

export function getResolvedTrackMbidsByAlbumId(albumId: string): string[] {
  return db
    .select({ musicbrainzId: sql<string>`${tracks.musicbrainzId}` })
    .from(tracks)
    .where(and(eq(tracks.albumId, albumId), isNotNull(tracks.musicbrainzId)))
    .all()
    .map((t) => t.musicbrainzId);
}

export function getTrackFilePathsInAlbum(albumId: string): string[] {
  return db
    .select({ filePath: tracks.filePath })
    .from(tracks)
    .where(eq(tracks.albumId, albumId))
    .all()
    .map((r) => r.filePath);
}

export type OrphanTrackRow = {
  id: string;
  title: string;
  trackNumber: number | null;
  discNumber: number | null;
  durationSeconds: number | null;
  filePath: string;
  sourceAlbumId: string;
  sourceAlbumTitle: string | null;
  artistName: string;
};

// Escape LIKE metacharacters in a literal prefix so directory paths match
// exactly. Uses '~' as the escape char (Windows path separators are '\', which
// is not a LIKE metacharacter, so backslashes stay literal).
function escapeLikePrefix(prefix: string): string {
  return prefix.replace(/[~%_]/g, (c) => `~${c}`);
}

// Local tracks that live in one of the given directories (each must already
// include a trailing path separator) but belong to a *different* album row.
// Used by Identify to surface orphan tracks a mistagged file stranded in a
// phantom album, so the user can pull them into the correct album.
export function getOrphanTracksInDirectories(
  directories: string[],
  excludeAlbumId: string,
): OrphanTrackRow[] {
  if (directories.length === 0) return [];
  const likeConds = directories.map(
    (dir) =>
      sql`${tracks.filePath} LIKE ${escapeLikePrefix(dir) + "%"} ESCAPE '~'`,
  );
  return db
    .select({
      id: tracks.id,
      title: resolvedTitle,
      trackNumber: tracks.trackNumber,
      discNumber: tracks.discNumber,
      durationSeconds: tracks.durationSeconds,
      filePath: tracks.filePath,
      sourceAlbumId: tracks.albumId,
      sourceAlbumTitle: resolvedAlbumTitle,
      artistName: resolvedArtistName,
    })
    .from(tracks)
    .innerJoin(artists, eq(tracks.artistId, artists.id))
    .leftJoin(albums, eq(tracks.albumId, albums.id))
    .where(
      and(
        or(...likeConds),
        isNotNull(tracks.albumId),
        ne(tracks.albumId, excludeAlbumId),
      ),
    )
    .orderBy(asc(tracks.discNumber), asc(tracks.trackNumber))
    .all() as OrphanTrackRow[];
}
