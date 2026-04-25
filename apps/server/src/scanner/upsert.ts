import { eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { artists, albums, tracks } from "../db/schema/index.js";
import type { TrackTags } from "./tags.js";

export function deleteTrackByPath(filePath: string): void {
  const track = db
    .select({
      id: tracks.id,
      albumId: tracks.albumId,
      artistId: tracks.artistId,
    })
    .from(tracks)
    .where(eq(tracks.filePath, filePath))
    .get();
  if (!track) return;

  db.run(sql`DELETE FROM tracks_fts WHERE track_id = ${track.id}`);
  db.delete(tracks).where(eq(tracks.id, track.id)).run();

  if (track.albumId) {
    const sibling = db
      .select({ id: tracks.id })
      .from(tracks)
      .where(eq(tracks.albumId, track.albumId))
      .limit(1)
      .get();
    if (!sibling) {
      db.delete(albums).where(eq(albums.id, track.albumId)).run();
    }
  }

  const artistTrack = db
    .select({ id: tracks.id })
    .from(tracks)
    .where(eq(tracks.artistId, track.artistId))
    .limit(1)
    .get();
  const artistAlbum = db
    .select({ id: albums.id })
    .from(albums)
    .where(eq(albums.artistId, track.artistId))
    .limit(1)
    .get();
  if (!artistTrack && !artistAlbum) {
    db.delete(artists).where(eq(artists.id, track.artistId)).run();
  }
}

export function upsertArtist(name: string): string {
  return db
    .insert(artists)
    .values({ name })
    .onConflictDoUpdate({ target: artists.name, set: { name } })
    .returning({ id: artists.id })
    .get()!.id;
}

export function upsertAlbum(
  title: string,
  artistId: string,
  releaseYear: number | null,
): string {
  return db
    .insert(albums)
    .values({ title, artistId, releaseYear })
    .onConflictDoUpdate({
      target: [albums.title, albums.artistId],
      set: { title },
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
