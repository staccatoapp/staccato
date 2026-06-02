import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import net from "node:net";
import dns from "node:dns/promises";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { coversDir } from "../paths.js";
import { logger } from "../logger.js";
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

interface StreamOptions {
  // "manual" makes a 3xx surface as a non-ok response instead of being followed
  // — used for untrusted (user-supplied) URLs so a redirect can't bounce the
  // fetch to an internal address after host validation (SSRF).
  redirect?: RequestInit["redirect"];
  // Reject responses whose Content-Type isn't image/*.
  requireImage?: boolean;
  // Hard cap on bytes written (checked via Content-Length and enforced while
  // streaming for chunked responses).
  maxBytes?: number;
}

// Download a remote image to `filePath` via a temp file + atomic rename. Returns
// false on a non-ok / rejected response (already logged); throws on a
// stream/rename error so callers can decide whether to swallow it.
async function streamRemoteToFile(
  remoteUrl: string,
  filePath: string,
  logContext: Record<string, unknown>,
  options: StreamOptions = {},
): Promise<boolean> {
  const res = await fetch(remoteUrl, {
    redirect: options.redirect ?? "follow",
  });
  if (!res.ok || !res.body) {
    log.warn(
      { ...logContext, status: res.status, remoteUrl },
      "cover art download non-ok response",
    );
    return false;
  }

  if (options.requireImage) {
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("image/")) {
      log.warn(
        { ...logContext, contentType },
        "cover art response is not an image",
      );
      return false;
    }
  }

  if (options.maxBytes != null) {
    const declared = Number(res.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > options.maxBytes) {
      log.warn(
        { ...logContext, contentLength: declared, maxBytes: options.maxBytes },
        "cover art exceeds max size",
      );
      return false;
    }
  }

  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    const source = Readable.fromWeb(res.body as never);
    const sink = fs.createWriteStream(tmpPath);
    if (options.maxBytes != null) {
      const { maxBytes } = options;
      let total = 0;
      const limiter = new Transform({
        transform(chunk: Buffer, _enc, cb) {
          total += chunk.length;
          if (total > maxBytes) {
            cb(new Error("cover art exceeds max size"));
            return;
          }
          cb(null, chunk);
        },
      });
      await pipeline(source, limiter, sink);
    } else {
      await pipeline(source, sink);
    }
    await fsp.rename(tmpPath, filePath);
  } catch (err) {
    await fsp.unlink(tmpPath).catch(() => undefined);
    throw err;
  }
  return true;
}

// Cover downloads are capped well above any real cover (a few MB) but low
// enough to bound abuse.
const MAX_COVER_BYTES = 15 * 1024 * 1024;

// Reject addresses that point back at the host or its private network — the
// targets an SSRF would aim for (cloud metadata, loopback services, LAN).
function isBlockedAddress(ip: string): boolean {
  const addr = ip.startsWith("::ffff:") ? ip.slice("::ffff:".length) : ip;
  if (net.isIPv4(addr)) {
    const parts = addr.split(".").map(Number);
    const a = parts[0] ?? 0;
    const b = parts[1] ?? 0;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local incl. cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
    if (a === 192 && b === 168) return true; // RFC1918
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }
  const v6 = addr.toLowerCase();
  if (v6 === "::" || v6 === "::1") return true; // unspecified / loopback
  if (v6.startsWith("fe80")) return true; // link-local
  if (v6.startsWith("fc") || v6.startsWith("fd")) return true; // ULA fc00::/7
  return false;
}

// Resolve a hostname and confirm every address it maps to is publicly routable.
// dns.lookup also accepts literal IPs, so this covers https://127.0.0.1/... too.
// NOTE: a small TOCTOU window remains (fetch re-resolves DNS) — full protection
// would require IP pinning, which is impractical with Node https + SNI. Paired
// with redirect:"manual" this blocks the realistic SSRF vectors here.
async function isPublicHost(
  hostname: string,
  logContext: Record<string, unknown>,
): Promise<boolean> {
  try {
    const results = await dns.lookup(hostname, { all: true });
    if (results.length === 0) return false;
    for (const { address } of results) {
      if (isBlockedAddress(address)) {
        log.warn(
          { ...logContext, hostname, address },
          "cover url resolves to a blocked (non-public) address",
        );
        return false;
      }
    }
    return true;
  } catch (err) {
    log.warn({ err, ...logContext, hostname }, "cover url dns lookup failed");
    return false;
  }
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
        maxBytes: MAX_COVER_BYTES,
      },
    );
    if (!ok) return null;
    return `${COVERS_URL_PREFIX}${fileName}`;
  } catch (err) {
    log.warn({ err, albumId, url }, "manual cover persist failed");
    return null;
  }
}
