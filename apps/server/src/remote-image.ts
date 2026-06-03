import fs from "node:fs";
import fsp from "node:fs/promises";
import net from "node:net";
import dns from "node:dns/promises";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { logger } from "./logger.js";

const log = logger.child({ module: "remote-image" });

export interface StreamOptions {
  // "manual" makes a 3xx surface as a non-ok response instead of being followed
  // — used so a redirect can't bounce the fetch to an internal address after
  // host validation (SSRF).
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
export async function streamRemoteToFile(
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
      "remote image download non-ok response",
    );
    return false;
  }

  if (options.requireImage) {
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("image/")) {
      log.warn(
        { ...logContext, contentType },
        "remote image response is not an image",
      );
      return false;
    }
  }

  if (options.maxBytes != null) {
    const declared = Number(res.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > options.maxBytes) {
      log.warn(
        { ...logContext, contentLength: declared, maxBytes: options.maxBytes },
        "remote image exceeds max size",
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
            cb(new Error("remote image exceeds max size"));
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

// Image downloads are capped well above any real image (a few MB) but low
// enough to bound abuse.
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

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
export async function isPublicHost(
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
          "remote url resolves to a blocked (non-public) address",
        );
        return false;
      }
    }
    return true;
  } catch (err) {
    log.warn({ err, ...logContext, hostname }, "remote url dns lookup failed");
    return false;
  }
}
