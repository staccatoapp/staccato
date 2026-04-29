import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { artists, albums, tracks } from "../db/schema/index.js";
import { normalizeString } from "../musicbrainz/client.js";
import type { TrackTags } from "./tags.js";
import {
  getTrackByFilePath,
  getTrackSiblingInAlbum,
  getTrackByArtist,
} from "../db/queries/tracks.js";
import { getAlbumByArtist, deleteAlbum } from "../db/queries/albums.js";
import { deleteArtist } from "../db/queries/artists.js";

export function deleteTrackByPath(filePath: string): void {
  const track = getTrackByFilePath(filePath);
  if (!track) return;

  db.run(sql`DELETE FROM tracks_fts WHERE track_id = ${track.id}`);
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

export function upsertArtist(name: string, mbid?: string | null): string {
  const normalizedInput = normalizeString(name);

  const sqlMatch = db
    .select({ id: artists.id, musicbrainzId: artists.musicbrainzId })
    .from(artists)
    .where(eq(artists.normalizedName, normalizedInput))
    .get();
  if (sqlMatch) {
    if (mbid && !sqlMatch.musicbrainzId) trySetArtistMbid(sqlMatch.id, mbid);
    return sqlMatch.id;
  }

  const allArtists = db
    .select({
      id: artists.id,
      name: artists.name,
      normalizedName: artists.normalizedName,
      canonicalName: artists.canonicalName,
      musicbrainzId: artists.musicbrainzId,
    })
    .from(artists)
    .all();
  const match = allArtists.find(
    (a) =>
      (a.normalizedName == null &&
        normalizeString(a.name) === normalizedInput) ||
      (a.canonicalName != null &&
        normalizeString(a.canonicalName) === normalizedInput),
  );
  if (match) {
    if (match.normalizedName == null) {
      db.update(artists)
        .set({ normalizedName: normalizeString(match.name) })
        .where(eq(artists.id, match.id))
        .run();
    }
    if (mbid && !match.musicbrainzId) trySetArtistMbid(match.id, mbid);
    return match.id;
  }

  return db
    .insert(artists)
    .values({ name, normalizedName: normalizedInput, musicbrainzId: mbid ?? null })
    .onConflictDoUpdate({
      target: artists.name,
      set: { name, normalizedName: normalizedInput },
    })
    .returning({ id: artists.id })
    .get()!.id;
}

function trySetArtistMbid(artistId: string, mbid: string): void {
  try {
    db.update(artists).set({ musicbrainzId: mbid }).where(eq(artists.id, artistId)).run();
  } catch {
    // unique constraint: mbid belongs to another artist — leave it for resolver dedup
  }
}

export function upsertAlbum(
  title: string,
  artistId: string,
  releaseYear: number | null,
  releaseMbid?: string | null,
): string {
  const normalizedInput = normalizeString(title);

  const sqlMatch = db
    .select({ id: albums.id, releaseMbid: albums.releaseMbid })
    .from(albums)
    .where(
      and(
        eq(albums.artistId, artistId),
        eq(albums.normalizedTitle, normalizedInput),
      ),
    )
    .get();
  if (sqlMatch) {
    if (releaseMbid && !sqlMatch.releaseMbid) {
      db.update(albums).set({ releaseMbid }).where(eq(albums.id, sqlMatch.id)).run();
    }
    return sqlMatch.id;
  }

  const artistAlbums = db
    .select({
      id: albums.id,
      title: albums.title,
      normalizedTitle: albums.normalizedTitle,
      canonicalTitle: albums.canonicalTitle,
      releaseMbid: albums.releaseMbid,
    })
    .from(albums)
    .where(eq(albums.artistId, artistId))
    .all();
  const match = artistAlbums.find(
    (a) =>
      (a.normalizedTitle == null &&
        normalizeString(a.title) === normalizedInput) ||
      (a.canonicalTitle != null &&
        normalizeString(a.canonicalTitle) === normalizedInput),
  );
  if (match) {
    const updates: Record<string, unknown> = {};
    if (match.normalizedTitle == null) updates.normalizedTitle = normalizeString(match.title);
    if (releaseMbid && !match.releaseMbid) updates.releaseMbid = releaseMbid;
    if (Object.keys(updates).length > 0) {
      db.update(albums).set(updates).where(eq(albums.id, match.id)).run();
    }
    return match.id;
  }

  return db
    .insert(albums)
    .values({ title, artistId, releaseYear, normalizedTitle: normalizedInput, releaseMbid: releaseMbid ?? null })
    .onConflictDoUpdate({
      target: [albums.title, albums.artistId],
      set: { title, normalizedTitle: normalizedInput },
    })
    .returning({ id: albums.id })
    .get()!.id;
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

  // drizzle doesn't support FTS yet so doing this with raw sql for now
  db.run(sql`DELETE FROM tracks_fts WHERE track_id = ${insertedTrack.id}`);
  db.run(sql`
  INSERT INTO tracks_fts(track_id, title, artist_name, album_title)
  VALUES (${insertedTrack.id}, ${tags.title}, ${tags.artistName}, ${tags.albumTitle})`);
}
