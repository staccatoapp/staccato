import {
  MetadataRecordingSchema,
  MetadataRecordingSearchResponseSchema,
  type MetadataRecording,
} from "@staccato/shared";
import {
  MB_PRIORITY,
  type MbPriority,
  throttledFetch,
} from "../musicbrainz/client.js";
import { logger } from "../logger.js";
import type { RecordingCandidate } from "./types.js";
import type { ResolutionMethod } from "../db/schema/tracks.js";

const log = logger.child({ module: "library:mb-lookup" });

// Façade base — both recording lookup (R1) and structured search (R2) go
// through the metadata service.
const FACADE_BASE =
  process.env.STACCATO_METADATA_URL ?? "http://localhost:8290/v1";

// MetadataRecording's artistCredits/releases are structurally identical to the
// resolver's ArtistCredit[]/ReleaseCandidate[] — only the resolution fields
// (method, acoustidScore) are layered on here.
function metadataToCandidate(
  data: MetadataRecording,
  method: ResolutionMethod,
  acoustidScore: number | null,
): RecordingCandidate {
  return {
    method,
    recordingMbid: data.recordingMbid,
    title: data.title,
    durationMs: data.durationMs,
    artistCredits: data.artistCredits,
    releases: data.releases,
    acoustidScore,
  };
}

// Cache the façade DTO (which is method/score-agnostic) keyed by mbid. `null`
// is cached too, to avoid re-fetching recordings known to be missing or
// video-only within a run. Inflight dedupe collapses concurrent callers for the
// same mbid (e.g. two AcoustID candidates resolving to the same recording, or a
// retry hitting an already-resolving id). Cleared on process restart.
const recordingRichCache = new Map<string, MetadataRecording | null>();
const recordingRichInflight = new Map<
  string,
  Promise<MetadataRecording | null>
>();

async function fetchRecordingRich(
  mbid: string,
  priority: MbPriority,
): Promise<MetadataRecording | null> {
  if (recordingRichCache.has(mbid)) {
    return recordingRichCache.get(mbid) ?? null;
  }
  const existing = recordingRichInflight.get(mbid);
  if (existing) return existing;

  const promise = (async (): Promise<MetadataRecording | null> => {
    try {
      const response = await throttledFetch(
        `${FACADE_BASE}/recordings/${mbid}`,
        { priority },
      );
      if (!response.ok) {
        log.warn(
          { status: response.status, recordingMbid: mbid },
          "facade recording lookup non-ok",
        );
        return null;
      }
      const data = MetadataRecordingSchema.parse(await response.json());
      // The resolver never wants a music-video recording as a candidate.
      if (data.video) return null;
      return data;
    } catch (err) {
      log.warn({ err, recordingMbid: mbid }, "facade recording lookup failed");
      return null;
    }
  })();

  recordingRichInflight.set(mbid, promise);
  try {
    const result = await promise;
    recordingRichCache.set(mbid, result);
    return result;
  } finally {
    recordingRichInflight.delete(mbid);
  }
}

export async function lookupRecordingRich(
  mbid: string,
  method: ResolutionMethod,
  acoustidScore: number | null = null,
  priority: MbPriority = MB_PRIORITY.BACKGROUND,
): Promise<RecordingCandidate | null> {
  const data = await fetchRecordingRich(mbid, priority);
  if (!data) return null;
  return metadataToCandidate(data, method, acoustidScore);
}

export async function searchRecordingsRich(
  queryStr: string,
  priority: MbPriority = MB_PRIORITY.BACKGROUND,
): Promise<Array<{ candidate: RecordingCandidate; mbScore: number }>> {
  try {
    const params = new URLSearchParams({ query: queryStr, limit: "10" });
    const response = await throttledFetch(
      `${FACADE_BASE}/recordings/search?${params}`,
      { priority },
    );
    if (!response.ok) {
      log.warn(
        { status: response.status, query: queryStr },
        "facade recording search non-ok",
      );
      return [];
    }
    const data = MetadataRecordingSearchResponseSchema.parse(
      await response.json(),
    );
    return data.recordings
      .filter((r) => r.video !== true)
      .map((r) => ({
        candidate: metadataToCandidate(r, "search", null),
        mbScore: r.score,
      }));
  } catch (err) {
    log.warn({ err, query: queryStr }, "facade recording search failed");
    return [];
  }
}
