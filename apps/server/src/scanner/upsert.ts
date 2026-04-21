import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { artists, albums, tracks } from "../db/schema/index.js";
import type { TrackTags } from "./tags.js";

export function upsertArtist(name: string): string {
  const existing = db
    .select({ id: artists.id })
    .from(artists)
    .where(eq(artists.name, name))
    .get();

  if (existing) return existing.id;

  const inserted = db
    .insert(artists)
    .values({ name })
    .returning({ id: artists.id })
    .get();

  return inserted.id;
}

export function upsertAlbum(
  title: string,
  artistId: string,
  releaseYear: number | null,
): string {
  const existing = db
    .select({ id: albums.id })
    .from(albums)
    .where(and(eq(albums.title, title), eq(albums.artistId, artistId)))
    .get();

  if (existing) return existing.id;

  const inserted = db
    .insert(albums)
    .values({ title, artistId, releaseYear })
    .returning({ id: albums.id })
    .get();

  return inserted.id;
}

export function upsertTrack(
  tags: TrackTags,
  filePath: string,
  artistId: string,
  albumId: string | null,
): void {
  db.insert(tracks)
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
    .run();
}
