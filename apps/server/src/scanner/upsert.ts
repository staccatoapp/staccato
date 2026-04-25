import { eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { artists, albums, tracks } from "../db/schema/index.js";
import type { TrackTags } from "./tags.js";

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
