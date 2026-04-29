import { walkAudioFiles } from "./walk.js";
import { extractTags } from "./tags.js";
import { upsertArtist, upsertAlbum, upsertTrack } from "./upsert.js";
import { startResolution } from "../resolver/index.js";
import { deleteOrphanAlbums } from "../db/queries/albums.js";
import { deleteOrphanArtists } from "../db/queries/artists.js";

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
  deleteOrphanAlbums();
  deleteOrphanArtists();
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
