import PQueue from "p-queue";
import { discoverFile, resolveTrack, enrichTrack } from "./worker.js";
import { logger } from "../logger.js";
import { getConfig } from "../config/config.js";

const log = logger.child({ module: "library:queue" });

const config = getConfig();
const DISCOVERY_CONCURRENCY =
  config.STACCATO_SERVER_LIBRARY_DISCOVERY_CONCURRENCY;
const RESOLUTION_CONCURRENCY =
  config.STACCATO_SERVER_LIBRARY_WORKER_CONCURRENCY;
const ENRICHMENT_CONCURRENCY =
  config.STACCATO_SERVER_LIBRARY_ENRICHMENT_CONCURRENCY;

// Discovery is local-IO bound (stat + tag read + row insert) and fast, so it
// runs at higher concurrency to surface pending rows quickly. Resolution is
// MusicBrainz-bound and gated by the shared MB throttle, so its concurrency is
// modest. Enrichment is best-effort background work kept off the critical path.
const discoveryQueue = new PQueue({ concurrency: DISCOVERY_CONCURRENCY });
const resolutionQueue = new PQueue({ concurrency: RESOLUTION_CONCURRENCY });
const enrichmentQueue = new PQueue({ concurrency: ENRICHMENT_CONCURRENCY });

export function enqueueDiscovery(filePath: string): void {
  discoveryQueue
    .add(() => discoverFile(filePath))
    .catch((err) =>
      log.error({ err, filePath }, "queued file discovery rejected"),
    );
}

export function enqueueResolution(filePath: string): void {
  resolutionQueue
    .add(() => resolveTrack(filePath))
    .catch((err) =>
      log.error({ err, filePath }, "queued track resolution rejected"),
    );
}

export function enqueueEnrichment(
  trackId: string,
  filePath: string,
  recordingMbid: string,
): void {
  enrichmentQueue
    .add(() => enrichTrack(trackId, filePath, recordingMbid))
    .catch((err) =>
      log.error({ err, trackId, recordingMbid }, "queued enrichment rejected"),
    );
}

export function queueSize(): number {
  return (
    discoveryQueue.size +
    discoveryQueue.pending +
    resolutionQueue.size +
    resolutionQueue.pending
  );
}

// Wait for the initial scan to settle: discovery must finish feeding resolution
// first, then resolution must drain. Enrichment is intentionally excluded — it
// is eventual-consistency background work and must not block scan completion.
export async function drain(): Promise<void> {
  await discoveryQueue.onIdle();
  await resolutionQueue.onIdle();
}
