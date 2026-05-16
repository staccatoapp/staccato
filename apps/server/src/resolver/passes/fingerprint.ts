import { fingerprintFile, isFpcalcAvailable } from "../../fingerprint/fpcalc.js";
import { lookupFingerprint } from "../../fingerprint/acoustid.js";
import {
  getUnresolvedTracksPendingFingerprint,
  updateTrackByTrackId,
} from "../../db/queries/tracks.js";
import { type ResolutionProgress } from "../types.js";
import { logger } from "../../logger.js";

const log = logger.child({ module: "resolver:fingerprint" });

export async function runFingerprintPass(progress: ResolutionProgress): Promise<void> {
  const apiKey = process.env.ACOUSTID_API_KEY;
  if (!apiKey) {
    log.warn("ACOUSTID_API_KEY not set, skipping fingerprint pass");
    return;
  }

  const available = await isFpcalcAvailable();
  if (!available) {
    log.warn("fpcalc not found, skipping fingerprint pass");
    return;
  }

  const unresolved = getUnresolvedTracksPendingFingerprint();

  log.info({ count: unresolved.length }, "fingerprint pass starting");

  for (const track of unresolved) {
    updateTrackByTrackId(track.trackId, { fingerprintStatus: "processing" });

    const fp = await fingerprintFile(track.filePath);
    if (!fp) {
      log.debug({ trackId: track.trackId, filePath: track.filePath }, "fpcalc returned no fingerprint");
      updateTrackByTrackId(track.trackId, { fingerprintStatus: "failed" });
      continue;
    }

    const match = await lookupFingerprint(fp.duration, fp.fingerprint, apiKey);
    if (match) {
      updateTrackByTrackId(track.trackId, {
        musicbrainzId: match.recordingMbid,
        fingerprintStatus: "matched",
        resolutionStatus: "resolved",
      });
      progress.resolved++;
    } else {
      log.debug({ trackId: track.trackId }, "acoustid lookup returned no match");
      updateTrackByTrackId(track.trackId, { fingerprintStatus: "failed" });
    }
  }
}
