import net from "node:net";
import dns from "node:dns/promises";
import { logger } from "../logger.js";

const log = logger.child({ module: "ssrf" });

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
          "url resolves to a blocked (non-public) address",
        );
        return false;
      }
    }
    return true;
  } catch (err) {
    log.warn({ err, ...logContext, hostname }, "dns lookup failed");
    return false;
  }
}
