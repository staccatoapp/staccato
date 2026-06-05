import PQueue from "p-queue";
import { APP_USER_AGENT } from "../constants.js";
import { logger } from "../logger.js";
import { getEnvironment } from "../environment/environment.js";
import {
  IdentifySearchResponseSchema,
  MetadataAlbumDetailSchema,
  MetadataArtistDetailSchema,
  MetadataRecordingSchema,
  MetadataReleaseDetailSchema,
  MetadataSearchResultsSchema,
  type IdentifyReleaseCandidate,
  type MetadataAlbumDetail,
  type MetadataArtistDetail,
  type MetadataArtistReleaseGroup,
  type MetadataArtist,
  type MetadataRelease,
  type MetadataReleaseDetail,
  type MetadataReleaseTrack,
  type MetadataSearchResults,
} from "@staccato/shared";

const log = logger.child({ module: "musicbrainz" });

export interface RecordingMatch {
  recordingMbid: string;
  releaseMbid: string | null;
  releaseGroupMbid: string | null;
  score: number;
  mbArtistName: string | null;
  mbArtistId: string | null;
  mbTrackTitle: string | null;
}

// Lookup DTOs now live in packages/shared as the façade contract. Aliased here
// so existing imports (identify.ts, etc.) keep working.
export type MBReleaseTrack = MetadataReleaseTrack;
export type MBReleaseDetails = MetadataReleaseDetail;
export type ExternalAlbumDetail = MetadataAlbumDetail;

function parseReleaseYear(date?: string | null): number | null {
  if (!date) return null;
  const year = parseInt(date.slice(0, 4), 10);
  return Number.isNaN(year) ? null : year;
}

const config = getEnvironment();
export const FACADE_BASE = config.STACCATO_METADATA_URL;

// Throttle knobs for the shared MB queue. Defaults match MusicBrainz's public
// 1-req/sec limit. When pointed at the hosted façade (STACCATO_METADATA_URL),
// raise MB_CONCURRENCY and set MB_RATE_LIMIT_MS=0 to drop the time-window cap
// so only concurrency governs throughput.
//   MB_CONCURRENCY   — max simultaneous in-flight requests   (default 1)
//   MB_INTERVAL_CAP  — max requests started per interval      (default 1)
//   MB_RATE_LIMIT_MS — interval window in ms; 0 disables it   (default 1100)
const MB_CONCURRENCY = config.MB_CONCURRENCY;
const MB_INTERVAL_CAP = config.MB_INTERVAL_CAP;
const MB_INTERVAL_MS = config.MB_RATE_LIMIT_MS;

// Priority lanes for shared external-API queues (MB + CAA). Higher number =
// runs sooner. INTERACTIVE is reserved for the search route (user typing).
// PAGE_LOAD covers fan-outs from album/artist/recs/downloads pages.
// BACKGROUND is the default for resolver passes and any other non-blocking
// work.
export const MB_PRIORITY = {
  INTERACTIVE: 20,
  PAGE_LOAD: 10,
  BACKGROUND: 0,
} as const;
export type MbPriority = (typeof MB_PRIORITY)[keyof typeof MB_PRIORITY];

const mbQueue = new PQueue({
  concurrency: MB_CONCURRENCY,
  intervalCap: MB_INTERVAL_CAP,
  interval: MB_INTERVAL_MS,
  carryoverConcurrencyCount: true,
});

log.info(
  {
    concurrency: MB_CONCURRENCY,
    intervalCap: MB_INTERVAL_CAP,
    intervalMs: MB_INTERVAL_MS,
    facadeUrl: FACADE_BASE,
  },
  "mb throttle configured",
);

export async function throttledFetch(
  url: string,
  opts: { priority?: MbPriority } = {},
): Promise<Response> {
  const priority = opts.priority ?? MB_PRIORITY.BACKGROUND;
  if (priority === MB_PRIORITY.INTERACTIVE && mbQueue.size > 0) {
    log.debug(
      { queueSize: mbQueue.size, pending: mbQueue.pending },
      "interactive mb call queued behind backlog",
    );
  }
  const res = await mbQueue.add(
    () => {
      log.debug({ url, priority }, "making mb request");
      return fetch(url, {
        headers: {
          "User-Agent": APP_USER_AGENT,
          Accept: "application/json",
        },
      });
    },
    { priority },
  );
  if (!res) throw new Error("mb queue returned no response");
  return res;
}

const TYPE_RANK: Record<string, number> = {
  Album: 0,
  EP: 1,
  Single: 2,
  Broadcast: 3,
  Other: 4,
};

// R3 · unified free-text search. One façade call fans out across the
// recording/artist/release Solr indexes and returns all three categories,
// replacing the three raw-MB *ByQuery functions. The server layers in-library /
// cover-art / artist-image enrichment on top (routes/search.ts).
export async function searchExternalUnified(
  query: string,
  limit = 10,
  priority: MbPriority = MB_PRIORITY.BACKGROUND,
): Promise<MetadataSearchResults | null> {
  try {
    const params = new URLSearchParams({ q: query, limit: String(limit) });
    const response = await throttledFetch(`${FACADE_BASE}/search?${params}`, {
      priority,
    });
    if (!response.ok) {
      log.warn(
        { status: response.status, operation: "searchExternalUnified", query },
        "facade unified search non-ok response",
      );
      return null;
    }
    return MetadataSearchResultsSchema.parse(await response.json());
  } catch (err) {
    log.warn(
      { err, operation: "searchExternalUnified", query },
      "facade unified search failed",
    );
    return null;
  }
}

// R5 · per-release search for the Identify Album dialog. Thin façade call — the
// metadata service builds the structured Lucene query (release/artist/year) and
// reshapes media/labels into IdentifyReleaseCandidate[]. Returns every pressing
// (no release-group dedup) so the user can pick the one whose tracklist matches
// their files. Defaults to INTERACTIVE priority (user is waiting on it).
export async function searchReleasesForIdentify(
  opts: { release: string; artist: string; year?: string },
  limit = 25,
  priority: MbPriority = MB_PRIORITY.INTERACTIVE,
): Promise<IdentifyReleaseCandidate[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (opts.release.trim()) params.set("release", opts.release.trim());
  if (opts.artist.trim()) params.set("artist", opts.artist.trim());
  if (opts.year?.trim()) params.set("year", opts.year.trim());

  try {
    const response = await throttledFetch(
      `${FACADE_BASE}/releases/search?${params}`,
      { priority },
    );
    if (!response.ok) {
      log.warn(
        {
          status: response.status,
          operation: "searchReleasesForIdentify",
          params: params.toString(),
        },
        "facade identify release search non-ok response",
      );
      return [];
    }
    return IdentifySearchResponseSchema.parse(await response.json()).results;
  } catch (err) {
    log.warn(
      {
        err,
        operation: "searchReleasesForIdentify",
        params: params.toString(),
      },
      "facade identify release search failed",
    );
    return [];
  }
}

export interface MBRecordingDetail {
  recordingMbid: string;
  title: string;
  artistName: string | null;
  artistMbid: string | null;
  releaseGroupMbid: string | null;
  releaseName: string | null;
  releaseYear: number | null;
  durationMs: number | null;
}

// Server-side release selection over the façade's MetadataRelease[] (R1 returns
// the full release set; the recs projection picks one). Same policy as the raw
// pickBestRelease below, expressed over the DTO field names.
function pickCanonicalRelease(
  releases: MetadataRelease[],
): MetadataRelease | null {
  const official = releases.filter((r) => r.status === "Official");
  if (official.length === 0) return null;
  return (
    [...official].sort((a, b) => {
      const rankA = TYPE_RANK[a.primaryType ?? "Other"] ?? 4;
      const rankB = TYPE_RANK[b.primaryType ?? "Other"] ?? 4;
      if (rankA !== rankB) return rankA - rankB;
      return (a.date ?? "9999") < (b.date ?? "9999") ? -1 : 1;
    })[0] ?? null
  );
}

const recordingDetailCache = new Map<string, MBRecordingDetail | null>();
const recordingDetailInflight = new Map<
  string,
  Promise<MBRecordingDetail | null>
>();

export async function lookupRecording(
  mbid: string,
  priority: MbPriority = MB_PRIORITY.BACKGROUND,
): Promise<MBRecordingDetail | null> {
  if (recordingDetailCache.has(mbid)) {
    return recordingDetailCache.get(mbid) ?? null;
  }
  const existing = recordingDetailInflight.get(mbid);
  if (existing) return existing;

  const promise = (async (): Promise<MBRecordingDetail | null> => {
    try {
      const response = await throttledFetch(
        `${FACADE_BASE}/recordings/${mbid}`,
        { priority },
      );
      if (!response.ok) {
        log.warn(
          {
            status: response.status,
            operation: "lookupRecording",
            recordingMbid: mbid,
          },
          "facade recording lookup non-ok response",
        );
        return null;
      }
      const data = MetadataRecordingSchema.parse(await response.json());
      const best =
        pickCanonicalRelease(data.releases) ?? data.releases[0] ?? null;
      const artist = data.artistCredits[0];
      return {
        recordingMbid: data.recordingMbid,
        title: data.title,
        artistName: artist?.name ?? null,
        artistMbid: artist?.mbid ?? null,
        releaseGroupMbid: best?.releaseGroupMbid ?? null,
        releaseName: best?.title ?? null,
        releaseYear: parseReleaseYear(best?.date),
        durationMs: data.durationMs,
      };
    } catch (err) {
      log.warn(
        { err, operation: "lookupRecording", recordingMbid: mbid },
        "facade recording lookup failed",
      );
      return null;
    }
  })();

  recordingDetailInflight.set(mbid, promise);
  try {
    const result = await promise;
    recordingDetailCache.set(mbid, result);
    return result;
  } finally {
    recordingDetailInflight.delete(mbid);
  }
}

export async function lookupReleaseDetails(
  releaseMbid: string,
  priority: MbPriority = MB_PRIORITY.BACKGROUND,
): Promise<MBReleaseDetails | null> {
  try {
    const response = await throttledFetch(
      `${FACADE_BASE}/releases/${releaseMbid}`,
      { priority },
    );
    if (!response.ok) {
      log.warn(
        {
          status: response.status,
          operation: "lookupReleaseDetails",
          releaseMbid,
        },
        "facade release lookup non-ok response",
      );
      return null;
    }
    return MetadataReleaseDetailSchema.parse(await response.json());
  } catch (err) {
    log.warn(
      { err, operation: "lookupReleaseDetails", releaseMbid },
      "facade release lookup failed",
    );
    return null;
  }
}

export type ExternalArtistDetail = MetadataArtist;
export type ArtistReleaseGroup = MetadataArtistReleaseGroup;

const artistDetailCache = new Map<string, MetadataArtistDetail | null>();
const artistDetailInflight = new Map<
  string,
  Promise<MetadataArtistDetail | null>
>();

// R7 · artist detail + discography in one façade round-trip. Replaces the
// previously separate lookupExternalArtist + getArtistReleaseGroups (the
// paginated release-group fetch now lives in the façade). Consumers read
// whichever half they need — the local-with-MBID branch uses only releaseGroups.
export async function lookupArtistDetail(
  artistMbid: string,
  priority: MbPriority = MB_PRIORITY.BACKGROUND,
): Promise<MetadataArtistDetail | null> {
  if (artistDetailCache.has(artistMbid)) {
    return artistDetailCache.get(artistMbid) ?? null;
  }
  const existing = artistDetailInflight.get(artistMbid);
  if (existing) return existing;

  const promise = (async (): Promise<MetadataArtistDetail | null> => {
    try {
      const response = await throttledFetch(
        `${FACADE_BASE}/artists/${artistMbid}`,
        { priority },
      );
      if (!response.ok) {
        log.warn(
          {
            status: response.status,
            operation: "lookupArtistDetail",
            artistMbid,
          },
          "facade artist lookup non-ok response",
        );
        return null;
      }
      return MetadataArtistDetailSchema.parse(await response.json());
    } catch (err) {
      log.warn(
        { err, operation: "lookupArtistDetail", artistMbid },
        "facade artist lookup failed",
      );
      return null;
    }
  })();

  artistDetailInflight.set(artistMbid, promise);
  try {
    const result = await promise;
    artistDetailCache.set(artistMbid, result);
    return result;
  } finally {
    artistDetailInflight.delete(artistMbid);
  }
}

export { normalizeString } from "./normalize.js";

export async function lookupExternalAlbum(
  rgMbid: string,
  priority: MbPriority = MB_PRIORITY.BACKGROUND,
): Promise<ExternalAlbumDetail | null> {
  try {
    const res = await throttledFetch(
      `${FACADE_BASE}/release-groups/${rgMbid}`,
      { priority },
    );
    if (!res.ok) {
      log.warn(
        {
          status: res.status,
          operation: "lookupExternalAlbum",
          releaseGroupMbid: rgMbid,
        },
        "facade release-group lookup non-ok response",
      );
      return null;
    }
    return MetadataAlbumDetailSchema.parse(await res.json());
  } catch (err) {
    log.warn(
      { err, operation: "lookupExternalAlbum", releaseGroupMbid: rgMbid },
      "facade release-group lookup failed",
    );
    return null;
  }
}
