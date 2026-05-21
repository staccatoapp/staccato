import { z } from "zod";
import {
  MB_PRIORITY,
  type MbPriority,
  throttledFetch,
} from "../musicbrainz/client.js";
import { logger } from "../logger.js";
import type {
  ArtistCredit,
  ReleaseCandidate,
  RecordingCandidate,
} from "./types.js";
import type { ResolutionMethod } from "../db/schema/tracks.js";

const log = logger.child({ module: "library:mb-lookup" });

const MB_BASE = process.env.METADATA_URL ?? "https://musicbrainz.org/ws/2";

const ArtistCreditEntrySchema = z.object({
  joinphrase: z.string().nullish(),
  artist: z.object({
    id: z.string(),
    name: z.string(),
  }),
});

const ReleaseRichSchema = z.object({
  id: z.string(),
  title: z.string().nullish(),
  date: z.string().nullish(),
  country: z.string().nullish(),
  status: z.string().nullish(),
  "release-group": z
    .object({
      id: z.string().nullish(),
      "primary-type": z.string().nullish(),
      "secondary-types": z.array(z.string()).nullish(),
    })
    .nullish(),
  media: z
    .array(
      z.object({
        format: z.string().nullish(),
      }),
    )
    .nullish(),
});

const RecordingRichSchema = z.object({
  id: z.string(),
  title: z.string().nullish(),
  length: z.number().nullish(),
  video: z.boolean().nullish(),
  "artist-credit": z.array(ArtistCreditEntrySchema).nullish(),
  releases: z.array(ReleaseRichSchema).nullish(),
});

const RecordingSearchRichResponseSchema = z.object({
  recordings: z.array(RecordingRichSchema.extend({ score: z.number() })),
});

function toArtistCredits(
  raw: Array<z.infer<typeof ArtistCreditEntrySchema>> | null | undefined,
): ArtistCredit[] {
  if (!raw) return [];
  return raw.map((entry) => ({
    mbid: entry.artist.id,
    name: entry.artist.name,
    joinPhrase: entry.joinphrase ?? null,
  }));
}

function toReleaseCandidates(
  raw: Array<z.infer<typeof ReleaseRichSchema>> | null | undefined,
): ReleaseCandidate[] {
  if (!raw) return [];
  return raw.map((r) => ({
    releaseMbid: r.id,
    releaseGroupMbid: r["release-group"]?.id ?? null,
    title: r.title ?? "",
    date: r.date ?? null,
    country: r.country ?? null,
    status: r.status ?? null,
    primaryType: r["release-group"]?.["primary-type"] ?? null,
    secondaryTypes: r["release-group"]?.["secondary-types"] ?? [],
    mediaFormats: (r.media ?? [])
      .map((m) => m.format)
      .filter((f): f is string => typeof f === "string"),
  }));
}

function toRecordingCandidate(
  raw: z.infer<typeof RecordingRichSchema>,
  method: ResolutionMethod,
  acoustidScore: number | null,
): RecordingCandidate {
  return {
    method,
    recordingMbid: raw.id,
    title: raw.title ?? "",
    durationMs: raw.length ?? null,
    artistCredits: toArtistCredits(raw["artist-credit"]),
    releases: toReleaseCandidates(raw.releases),
    acoustidScore,
  };
}

// Cache the parsed MB response (which is method/score-agnostic) keyed by mbid.
// `null` is cached too, to avoid re-fetching recordings known to be missing or
// video-only within a run. Inflight dedupe collapses concurrent callers for the
// same mbid (e.g. two AcoustID candidates resolving to the same recording, or a
// retry hitting an already-resolving id). Cleared on process restart.
type RecordingRichData = z.infer<typeof RecordingRichSchema>;
const recordingRichCache = new Map<string, RecordingRichData | null>();
const recordingRichInflight = new Map<
  string,
  Promise<RecordingRichData | null>
>();

async function fetchRecordingRich(
  mbid: string,
  priority: MbPriority,
): Promise<RecordingRichData | null> {
  if (recordingRichCache.has(mbid)) {
    return recordingRichCache.get(mbid) ?? null;
  }
  const existing = recordingRichInflight.get(mbid);
  if (existing) return existing;

  const promise = (async (): Promise<RecordingRichData | null> => {
    try {
      const url =
        `${MB_BASE}/recording/${mbid}` +
        `?inc=artist-credits+releases+release-groups+media&fmt=json`;
      const response = await throttledFetch(url, { priority });
      if (!response.ok) {
        log.warn(
          { status: response.status, recordingMbid: mbid },
          "mb recording rich lookup non-ok",
        );
        return null;
      }
      const data = RecordingRichSchema.parse(await response.json());
      if (data.video) return null;
      return data;
    } catch (err) {
      log.warn({ err, recordingMbid: mbid }, "mb recording rich lookup failed");
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
  return toRecordingCandidate(data, method, acoustidScore);
}

export async function searchRecordingsRich(
  queryStr: string,
  priority: MbPriority = MB_PRIORITY.BACKGROUND,
): Promise<Array<{ candidate: RecordingCandidate; mbScore: number }>> {
  try {
    const params = new URLSearchParams({
      query: queryStr,
      fmt: "json",
      limit: "10",
    });
    const url =
      `${MB_BASE}/recording?${params}` +
      `&inc=artist-credits+releases+release-groups+media`;
    const response = await throttledFetch(url, { priority });
    if (!response.ok) {
      log.warn(
        { status: response.status, query: queryStr },
        "mb recording rich search non-ok",
      );
      return [];
    }
    const data = RecordingSearchRichResponseSchema.parse(await response.json());
    return data.recordings
      .filter((r) => r.video !== true)
      .map((r) => ({
        candidate: toRecordingCandidate(r, "search", null),
        mbScore: r.score,
      }));
  } catch (err) {
    log.warn({ err, query: queryStr }, "mb recording rich search failed");
    return [];
  }
}
