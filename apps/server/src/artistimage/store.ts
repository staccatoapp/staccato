import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { artistImagesDir } from "../paths.js";
import { logger } from "../logger.js";
import { lookupArtistImageSource } from "./client.js";
import { MB_PRIORITY, type MbPriority } from "../musicbrainz/client.js";
import { updateArtist } from "../db/queries/artists.js";

const log = logger.child({ module: "artistimage-store" });

const ARTIST_IMAGES_URL_PREFIX = "/metadata/artists/";
const ALLOWED_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".svg"]);

let dirEnsured = false;
function ensureDir(): void {
  if (dirEnsured) return;
  fs.mkdirSync(artistImagesDir, { recursive: true });
  dirEnsured = true;
}

// In-memory map mbid → ext for files already on disk. Populated lazily on
// first access from a single readdir, then maintained by writes.
let extByMbid: Map<string, string> | null = null;
function getExtMap(): Map<string, string> {
  if (extByMbid) return extByMbid;
  ensureDir();
  const map = new Map<string, string>();
  try {
    for (const entry of fs.readdirSync(artistImagesDir)) {
      const ext = path.extname(entry).toLowerCase();
      if (!ext) continue;
      const mbid = entry.slice(0, -ext.length);
      if (mbid) map.set(mbid, ext);
    }
  } catch (err) {
    log.warn({ err, dir: artistImagesDir }, "artist images dir readdir failed");
  }
  extByMbid = map;
  return map;
}

export function localArtistImageUrl(artistMbid: string, ext: string): string {
  return `${ARTIST_IMAGES_URL_PREFIX}${artistMbid}${ext}`;
}

export function isLocalArtistImageUrl(
  value: string | null | undefined,
): value is string {
  return (
    typeof value === "string" && value.startsWith(ARTIST_IMAGES_URL_PREFIX)
  );
}

function isTrustedWikimediaUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol !== "https:") return false;
    return hostname === "wikimedia.org" || hostname.endsWith(".wikimedia.org");
  } catch {
    return false;
  }
}

const inflight = new Map<string, Promise<string | null>>();

export async function ensureArtistImageOnDisk(
  artistMbid: string,
  priority: MbPriority = MB_PRIORITY.BACKGROUND,
): Promise<string | null> {
  if (!artistMbid) return null;
  ensureDir();

  const map = getExtMap();
  const existingExt = map.get(artistMbid);
  if (existingExt) {
    const filePath = path.join(artistImagesDir, `${artistMbid}${existingExt}`);
    if (fs.existsSync(filePath)) {
      return localArtistImageUrl(artistMbid, existingExt);
    }
    // Map drifted from disk; fall through to refetch.
    map.delete(artistMbid);
  }

  const existing = inflight.get(artistMbid);
  if (existing) return existing;

  const promise = (async (): Promise<string | null> => {
    try {
      const source = await lookupArtistImageSource(artistMbid, priority);
      if (!source) return null;

      if (!isTrustedWikimediaUrl(source.url)) {
        log.warn(
          { artistMbid, url: source.url },
          "artist image url rejected: untrusted host",
        );
        return null;
      }

      const rawExt = path.extname(source.filename).toLowerCase();
      const ext = ALLOWED_EXTS.has(rawExt) ? rawExt : null;
      if (!ext) {
        log.warn(
          { artistMbid, filename: source.filename, rawExt },
          "artist image has unsupported extension",
        );
        return null;
      }

      const res = await fetch(source.url);
      if (!res.ok || !res.body) {
        log.warn(
          { artistMbid, status: res.status, url: source.url },
          "artist image download non-ok response",
        );
        return null;
      }

      const filePath = path.join(artistImagesDir, `${artistMbid}${ext}`);
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

      map.set(artistMbid, ext);
      return localArtistImageUrl(artistMbid, ext);
    } catch (err) {
      log.warn({ err, artistMbid }, "artist image persist failed");
      return null;
    }
  })();

  inflight.set(artistMbid, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(artistMbid);
  }
}

// Mirror of resolveAlbumCoverNow. Returns the URL to serve in THIS response,
// scheduling a background download + DB update so the NEXT response serves
// the local file.
export function resolveArtistImageNow(row: {
  artistId: string;
  musicbrainzId: string | null;
  imageUrl: string | null;
}): string | null {
  if (isLocalArtistImageUrl(row.imageUrl)) return row.imageUrl;
  if (!row.musicbrainzId) return row.imageUrl;

  void ensureArtistImageOnDisk(row.musicbrainzId).then((local) => {
    if (!local) return;
    try {
      updateArtist(row.artistId, { imageUrl: local });
    } catch (err) {
      log.warn(
        { err, artistId: row.artistId },
        "lazy artist image url db update failed",
      );
    }
  });

  return row.imageUrl;
}
