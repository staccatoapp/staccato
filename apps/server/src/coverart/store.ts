import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { coversDir } from "../paths.js";
import { logger } from "../logger.js";
import { fetchCoverArtUrlForGroup } from "./client.js";
import { updateAlbumByAlbumId } from "../db/queries/albums.js";

const log = logger.child({ module: "coverart-store" });

const COVERS_URL_PREFIX = "/metadata/covers/";

let coversDirEnsured = false;
function ensureCoversDir(): void {
  if (coversDirEnsured) return;
  fs.mkdirSync(coversDir, { recursive: true });
  coversDirEnsured = true;
}

export function localCoverUrl(releaseGroupMbid: string): string {
  return `${COVERS_URL_PREFIX}${releaseGroupMbid}.jpg`;
}

export function isLocalCoverUrl(
  value: string | null | undefined,
): value is string {
  return typeof value === "string" && value.startsWith(COVERS_URL_PREFIX);
}

const inflight = new Map<string, Promise<string | null>>();

export async function ensureCoverOnDisk(
  releaseGroupMbid: string,
): Promise<string | null> {
  if (!releaseGroupMbid) return null;
  ensureCoversDir();

  const filePath = path.join(coversDir, `${releaseGroupMbid}.jpg`);

  if (fs.existsSync(filePath)) {
    return localCoverUrl(releaseGroupMbid);
  }

  const existing = inflight.get(releaseGroupMbid);
  if (existing) return existing;

  const promise = (async (): Promise<string | null> => {
    try {
      const remoteUrl = await fetchCoverArtUrlForGroup(releaseGroupMbid);
      if (!remoteUrl) return null;

      const res = await fetch(remoteUrl);
      if (!res.ok || !res.body) {
        log.warn(
          {
            releaseGroupMbid,
            status: res.status,
            remoteUrl,
          },
          "cover art download non-ok response",
        );
        return null;
      }

      const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
      try {
        await pipeline(
          Readable.fromWeb(res.body as never),
          fs.createWriteStream(tmpPath),
        );
        await fsp.rename(tmpPath, filePath);
      } catch (err) {
        await fsp.unlink(tmpPath).catch(() => undefined);
        throw err;
      }

      return localCoverUrl(releaseGroupMbid);
    } catch (err) {
      log.warn(
        { err, releaseGroupMbid },
        "cover art persist failed",
      );
      return null;
    }
  })();

  inflight.set(releaseGroupMbid, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(releaseGroupMbid);
  }
}

// Returns the URL to serve in the current response. If the stored value is
// already a local /covers/ path, returns it verbatim. Otherwise schedules a
// background download + DB update so the next request serves locally, and
// returns the existing (possibly stale archive.org) URL for THIS request so
// the user doesn't see a broken image.
export function resolveAlbumCoverNow(row: {
  albumId: string;
  releaseGroupMbid: string | null;
  coverArtUrl: string | null;
}): string | null {
  if (isLocalCoverUrl(row.coverArtUrl)) return row.coverArtUrl;
  if (!row.releaseGroupMbid) return row.coverArtUrl;

  void ensureCoverOnDisk(row.releaseGroupMbid).then((local) => {
    if (!local) return;
    try {
      updateAlbumByAlbumId(row.albumId, { coverArtUrl: local });
    } catch (err) {
      log.warn(
        { err, albumId: row.albumId },
        "lazy cover url db update failed",
      );
    }
  });

  return row.coverArtUrl;
}
