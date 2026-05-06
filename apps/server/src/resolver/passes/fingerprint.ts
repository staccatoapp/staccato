import { fingerprintFile, isFpcalcAvailable } from "../../fingerprint/fpcalc.js";
import { lookupFingerprint } from "../../fingerprint/acoustid.js";
import {
  getUnresolvedTracksPendingFingerprint,
  updateTrackByTrackId,
} from "../../db/queries/tracks.js";
import { type ResolutionProgress } from "../types.js";

export async function runFingerprintPass(progress: ResolutionProgress): Promise<void> {
  const apiKey = process.env.ACOUSTID_API_KEY;
  if (!apiKey) {
    console.log(
      "[resolver] ACOUSTID_API_KEY not set — skipping fingerprint pass",
    );
    return;
  }

  const available = await isFpcalcAvailable();
  if (!available) {
    console.log("[resolver] fpcalc not found — skipping fingerprint pass");
    return;
  }

  const unresolved = getUnresolvedTracksPendingFingerprint();

  console.log(`[resolver] fingerprint pass: ${unresolved.length} tracks`);

  for (const track of unresolved) {
    updateTrackByTrackId(track.trackId, { fingerprintStatus: "processing" });

    const fp = await fingerprintFile(track.filePath);
    if (!fp) {
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
      updateTrackByTrackId(track.trackId, { fingerprintStatus: "failed" });
    }
  }
}
