import { walkAudioFiles } from "./walk.js";
import { extractTags } from "./tags.js";
import { startResolution } from "../resolver/index.js";
import { deleteOrphanAlbums, upsertAlbum } from "../db/queries/albums.js";
import { deleteOrphanArtists, upsertArtist } from "../db/queries/artists.js";
import { upsertTrack } from "../db/queries/tracks.js";
import { logger } from "../logger.js";

const log = logger.child({ module: "scanner" });

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
  log.info({ musicDir, fileCount: files.length }, "scan starting");

  for (const filePath of files) {
    try {
      const tags = await extractTags(filePath);
      const artistId = upsertArtist(tags.albumArtist ?? tags.artistName, tags.mbAlbumArtistId);
      const albumId = tags.albumTitle
        ? upsertAlbum(tags.albumTitle, artistId, tags.year, tags.mbAlbumId, tags.mbReleaseGroupId)
        : null;
      upsertTrack(tags, filePath, artistId, albumId);
      scanProgress.scanned++;
    } catch (err) {
      scanProgress.failed++;
      log.error({ err, filePath }, "scan failed for file");
    }
  }

  scanProgress.running = false;
  scanProgress.completedAt = new Date();

  cleanupOrphans();
  log.info(
    { scanned: scanProgress.scanned, failed: scanProgress.failed },
    "scan complete, starting resolution",
  );
  await startResolution();
}
