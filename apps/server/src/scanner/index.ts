import { and, eq, notExists } from "drizzle-orm";
import { db } from "../db/index.js";
import { artists, albums, tracks } from "../db/schema/index.js";
import { walkAudioFiles } from "./walk.js";
import { extractTags } from "./tags.js";
import { upsertArtist, upsertAlbum, upsertTrack } from "./upsert.js";
import { startResolution } from "../resolver/index.js";

export interface ScanProgress {
  running: boolean;
  scanned: number;
  failed: number;
  total: number | null;
  startedAt: Date | null;
  completedAt: Date | null;
}

export let scanProgress: ScanProgress = {
  running: false,
  scanned: 0,
  failed: 0,
  total: null,
  startedAt: null,
  completedAt: null,
};

function cleanupOrphans(): void {
  db.delete(albums)
    .where(
      notExists(
        db
          .select({ id: tracks.id })
          .from(tracks)
          .where(eq(tracks.albumId, albums.id))
          .limit(1),
      ),
    )
    .run();

  db.delete(artists)
    .where(
      and(
        notExists(
          db
            .select({ id: albums.id })
            .from(albums)
            .where(eq(albums.artistId, artists.id))
            .limit(1),
        ),
        notExists(
          db
            .select({ id: tracks.id })
            .from(tracks)
            .where(eq(tracks.artistId, artists.id))
            .limit(1),
        ),
      ),
    )
    .run();
}

export async function startScan(musicDir: string): Promise<void> {
  scanProgress = {
    running: true,
    scanned: 0,
    failed: 0,
    total: null,
    startedAt: new Date(),
    completedAt: null,
  };

  const files = [...walkAudioFiles(musicDir)];
  scanProgress.total = files.length;

  for (const filePath of files) {
    try {
      const tags = await extractTags(filePath);
      const artistId = upsertArtist(tags.albumArtist ?? tags.artistName);
      const albumId = tags.albumTitle
        ? upsertAlbum(tags.albumTitle, artistId, tags.year)
        : null;
      upsertTrack(tags, filePath, artistId, albumId);
      scanProgress.scanned++;
    } catch (err) {
      scanProgress.failed++;
      console.error(`[scanner] failed: ${filePath}`, err);
    }
  }

  scanProgress.running = false;
  scanProgress.completedAt = new Date();

  cleanupOrphans();
  console.log("[scanner] scan complete, starting resolution");
  await startResolution();
}
