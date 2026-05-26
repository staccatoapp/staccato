import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "node:path";
import * as schema from "../schema/index.js";
import { upsertArtist } from "../queries/artists.js";
import { upsertAlbumForDiscovery } from "../queries/albums.js";
import {
  upsertDiscoveredTrack,
  markTrackResolving,
} from "../queries/tracks.js";

export type TestDb = ReturnType<typeof createTestDb>;

export function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  return db;
}

export function seedArtist(name = "Test Artist", mbid?: string): string {
  return upsertArtist(name, mbid);
}

export function seedAlbum(
  artistId: string,
  title = "Test Album",
  releaseYear: number | null = 2000,
): string {
  return upsertAlbumForDiscovery(title, artistId, releaseYear, null, null);
}

export function seedTrack(
  artistId: string,
  albumId: string | null,
  overrides: { title?: string; filePath?: string; trackNumber?: number } = {},
): string {
  const {
    title = "Test Track",
    filePath = "/music/test.flac",
    trackNumber = 1,
  } = overrides;
  const trackId = upsertDiscoveredTrack(
    {
      filePath,
      title,
      artistId,
      albumId,
      trackNumber,
      discNumber: 1,
      durationSeconds: 200,
      fileFormat: "flac",
      fileSizeBytes: 1_000_000,
      fileMtime: 0,
      mbRecordingId: null,
    },
    "Test Artist",
    "Test Album",
  );
  markTrackResolving(trackId);
  return trackId;
}
