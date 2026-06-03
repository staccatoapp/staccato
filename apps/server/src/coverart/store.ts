import fs from "node:fs";
import path from "node:path";
import { coversDir } from "../paths.js";
import { logger } from "../logger.js";
import {
  isPublicHost,
  streamRemoteToFile,
  MAX_IMAGE_BYTES,
} from "../remote-image.js";
import { facadeCoverArtUrl, fetchCoverArtUrlForGroup } from "./client.js";
import { MB_PRIORITY, type MbPriority } from "../musicbrainz/client.js";
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

function isTrustedCoverArtUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol !== "https:") return false;
    return (
      hostname === "coverartarchive.org" ||
      hostname.endsWith(".coverartarchive.org") ||
      hostname === "archive.org" ||
      hostname.endsWith(".archive.org")
    );
  } catch {
    return false;
  }
}

const inflight = new Map<string, Promise<string | null>>();

export async function ensureCoverOnDisk(
  releaseGroupMbid: string,
  priority: MbPriority = MB_PRIORITY.BACKGROUND,
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
      const remoteUrl = await fetchCoverArtUrlForGroup(
        releaseGroupMbid,
        priority,
      );
      if (!remoteUrl) return null;

      if (!isTrustedCoverArtUrl(remoteUrl)) {
        log.warn(
          { releaseGroupMbid, remoteUrl },
          "cover art url rejected: untrusted host",
        );
        return null;
      }

      const ok = await streamRemoteToFile(remoteUrl, filePath, {
        releaseGroupMbid,
      });
      if (!ok) return null;

      return localCoverUrl(releaseGroupMbid);
    } catch (err) {
      log.warn({ err, releaseGroupMbid }, "cover art persist failed");
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

// Non-blocking cover resolver for release-groups not in the local DB (e.g.
// external discography items on the artist page). Returns the local URL if the
// file already lives on disk; otherwise returns the upstream CAA URL for THIS
// response and schedules a background download so the NEXT response serves
// locally. No DB write — these MBIDs may never become library albums.
export function resolveExternalCoverNow(
  releaseGroupMbid: string,
  priority: MbPriority = MB_PRIORITY.PAGE_LOAD,
): string {
  ensureCoversDir();
  const filePath = path.join(coversDir, `${releaseGroupMbid}.jpg`);
  if (fs.existsSync(filePath)) return localCoverUrl(releaseGroupMbid);

  void ensureCoverOnDisk(releaseGroupMbid, priority).catch((err) => {
    log.warn(
      { err, releaseGroupMbid },
      "background external cover fetch failed",
    );
  });

  // Serve the façade cover-art endpoint for THIS response; it 302s straight to
  // the image (R9), so the browser <img> resolves it like the old CAA URL.
  return facadeCoverArtUrl(releaseGroupMbid);
}

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

// Download a user-pasted cover URL into the cover store and return its local
// /metadata/covers path. Mirrors how scanned covers are cached — we never
// persist the raw external URL (avoids leaking viewer IPs and storing arbitrary
// third-party links). https only. Returns null on a bad scheme or any failure
// (logged); callers should keep the existing cover when null.
export async function cacheCoverFromUrl(
  albumId: string,
  url: string,
): Promise<string | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    log.warn({ albumId, url }, "manual cover url is not a valid URL");
    return null;
  }
  if (parsed.protocol !== "https:") {
    log.warn({ albumId, url }, "manual cover url rejected: non-https");
    return null;
  }
  // SSRF guard: the URL is admin-supplied, so block fetches that resolve to the
  // host's own/loopback/private network before issuing the request.
  if (!(await isPublicHost(parsed.hostname, { albumId }))) {
    return null;
  }

  ensureCoversDir();
  const fileName = `album-${albumId}.jpg`;
  const filePath = path.join(coversDir, fileName);
  try {
    // redirect:"manual" — don't let a 3xx bounce us to an internal address
    // after the host check. requireImage + maxBytes bound the response.
    const ok = await streamRemoteToFile(
      url,
      filePath,
      { albumId },
      {
        redirect: "manual",
        requireImage: true,
        maxBytes: MAX_IMAGE_BYTES,
      },
    );
    if (!ok) return null;
    return `${COVERS_URL_PREFIX}${fileName}`;
  } catch (err) {
    log.warn({ err, albumId, url }, "manual cover persist failed");
    return null;
  }
}
