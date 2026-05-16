// TODO - desperately needs cleaning up and splitting out, file is messy, but i cba right now

import throttle from "p-throttle";
import { APP_USER_AGENT } from "../constants.js";
import { logger } from "../logger.js";

const log = logger.child({ module: "musicbrainz" });
import {
  MBArtistSearchResponseSchema,
  MBExternalRecordingSearchResponseSchema,
  MBRecordingLookupSchema,
  MBRecordingSearchResponseSchema,
  MBReleaseGroupLookupSchema,
  MBReleaseGroupSearchResponseSchema,
  MBReleaseLookupSchema,
  MBReleaseSearchResponseSchema,
} from "./schemas.js";

export interface RecordingMatch {
  recordingMbid: string;
  releaseMbid: string | null;
  releaseGroupMbid: string | null;
  score: number;
  mbArtistName: string | null;
  mbArtistId: string | null;
  mbTrackTitle: string | null;
}

export interface ExternalRecordingResult {
  recordingMbid: string;
  title: string;
  artistName: string;
  artistMbid: string | null;
  releaseName: string | null;
  releaseMbid: string | null;
  releaseYear: number | null;
  durationMs: number | null;
}

export interface ExternalArtistResult {
  artistMbid: string;
  name: string;
  disambiguation: string | null;
  type: string | null;
}

export interface ExternalReleaseResult {
  releaseMbid: string;
  releaseGroupMbid: string | null;
  title: string;
  artistName: string;
  artistMbid: string | null;
  releaseYear: number | null;
  releaseType: string | null;
}

export interface ExternalAlbumDetail {
  releaseGroupMbid: string;
  releaseMbid: string;
  title: string;
  artistName: string;
  artistMbid: string | null;
  releaseYear: number | null;
  releaseType: string | null;
  tracks: MBReleaseTrack[];
}

export interface MBReleaseTrack {
  discPosition: number;
  trackPosition: number;
  recordingMbid: string;
  title: string;
  durationMs: number | null;
}

export interface MBReleaseDetails {
  tracks: MBReleaseTrack[];
  releaseName: string | null;
  artistMbid: string | null;
  artistName: string | null;
  releaseGroupMbid: string | null;
}

interface MBReleaseLike {
  id: string;
  title?: string;
  date?: string;
  status?: string;
  "release-group"?: { id?: string; "primary-type"?: string };
}

function parseReleaseYear(date?: string): number | null {
  if (!date) return null;
  const year = parseInt(date.slice(0, 4), 10);
  return Number.isNaN(year) ? null : year;
}

const MB_BASE = "https://musicbrainz.org/ws/2";

const MB_INTERVAL_MS = parseInt(process.env.MB_RATE_LIMIT_MS ?? "1100", 10);

export const throttledFetch = throttle({ limit: 1, interval: MB_INTERVAL_MS })(
  async (url: string, req?: RequestInit): Promise<Response> =>
    fetch(url, {
      ...req,
      headers: {
        "User-Agent": APP_USER_AGENT,
        Accept: "application/json",
        ...req?.headers,
      },
    }),
);

const TYPE_RANK: Record<string, number> = {
  Album: 0,
  EP: 1,
  Single: 2,
  Broadcast: 3,
  Other: 4,
};

// TODO - working, but could be improved further by also considering release group types, and maybe doing a separate search for release groups when we have an album hint? need to experiment more with the best way to leverage release group info in matching
export async function searchRecording(
  artistName: string,
  title: string,
  hint?: { albumTitle: string; releaseYear?: number },
): Promise<RecordingMatch | null> {
  // first try match on artist + title - gets the better tagged matches out of the way faster
  // video:false excludes music-video recordings, which share artist+title with the audio recording
  // and can outrank it in MB's relevance scoring (e.g. alt-J "Breezeblocks")
  const artistAndTitleMatch = await attemptRecordingSearch(
    `artist:"${artistName}" AND recording:"${title}" AND video:false`,
    85,
    hint,
  );
  if (artistAndTitleMatch) return artistAndTitleMatch;

  // then try album + title for cases where files aren't tagged with artist
  // there probably is a cleaner/more reusable way to construct the queries. im just happy it's working atm tbh
  if (hint?.albumTitle) {
    return attemptRecordingSearch(
      `recording:"${title}" AND release:"${hint.albumTitle}" AND video:false`,
      90,
      hint,
    );
  }

  return null;
}

async function attemptRecordingSearch(
  queryStr: string,
  minScore: number,
  hint?: { albumTitle: string; releaseYear?: number },
): Promise<RecordingMatch | null> {
  try {
    const query = new URLSearchParams({
      query: queryStr,
      fmt: "json",
      limit: "10", // unsure here. 10 seems to be enough for hitting the right recording without iterating through too many junk ones, need to play more
    });
    const response = await throttledFetch(
      `${MB_BASE}/recording?${query}&inc=releases+release-groups+artist-credits`,
    );
    if (!response.ok) {
      log.warn(
        { status: response.status, operation: "attemptRecordingSearch", query: queryStr },
        "mb recording search non-ok response",
      );
      return null;
    }
    const data = MBRecordingSearchResponseSchema.parse(await response.json());
    const normalizedHint = hint?.albumTitle
      ? normalizeString(hint.albumTitle)
      : null;
    for (const recording of data.recordings) {
      if (recording.video === true) continue;
      if (recording.score < minScore) continue;
      if (
        normalizedHint &&
        recording.releases &&
        recording.releases.length > 0
      ) {
        const matchesHint = recording.releases.some(
          (rel) => rel.title && normalizeString(rel.title) === normalizedHint,
        );
        if (!matchesHint) continue;
      }
      const bestReleaseMbid = recording.releases?.length
        ? pickBestRelease(recording.releases, hint)
        : null;
      const bestRelease = recording.releases?.find(
        (rel) => rel.id === bestReleaseMbid,
      ) ?? recording.releases?.[0];
      return {
        recordingMbid: recording.id,
        releaseMbid: bestReleaseMbid,
        releaseGroupMbid: bestRelease?.["release-group"]?.id ?? null,
        score: recording.score,
        mbArtistName: recording["artist-credit"]?.[0]?.artist.name ?? null,
        mbArtistId: recording["artist-credit"]?.[0]?.artist.id ?? null,
        mbTrackTitle: recording.title ?? null,
      };
    }
    return null;
  } catch (err) {
    log.warn(
      { err, operation: "attemptRecordingSearch", query: queryStr },
      "mb recording search failed",
    );
    return null;
  }
}

export async function searchRecordingsByQuery(
  query: string,
  limit = 10,
): Promise<ExternalRecordingResult[]> {
  try {
    const params = new URLSearchParams({
      query,
      fmt: "json",
      limit: String(limit),
    });
    const response = await throttledFetch(
      `${MB_BASE}/recording?${params}&inc=releases+release-groups+artist-credits`,
    );
    if (!response.ok) {
      log.warn(
        { status: response.status, operation: "searchRecordingsByQuery", query },
        "mb external recording search non-ok response",
      );
      return [];
    }
    const data = MBExternalRecordingSearchResponseSchema.parse(
      await response.json(),
    );
    return data.recordings
      .filter((r) => r.video !== true)
      .map((r) => {
      const bestRelease = r.releases?.length
        ? pickBestRelease(r.releases)
        : null;
      const releaseObj =
        r.releases?.find((rel) => rel.id === bestRelease) ?? r.releases?.[0];
      return {
        recordingMbid: r.id,
        title: r.title,
        artistName: r["artist-credit"]?.[0]?.artist.name ?? "Unknown Artist",
        artistMbid: r["artist-credit"]?.[0]?.artist.id ?? null,
        releaseName: releaseObj?.title ?? null,
        releaseMbid: releaseObj?.id ?? null,
        releaseYear: parseReleaseYear(releaseObj?.date),
        durationMs: r.length ?? null,
      };
    });
  } catch (err) {
    log.warn(
      { err, operation: "searchRecordingsByQuery", query },
      "mb external recording search failed",
    );
    return [];
  }
}

export async function searchArtistsByQuery(
  query: string,
  limit = 5,
): Promise<ExternalArtistResult[]> {
  try {
    const params = new URLSearchParams({
      query,
      fmt: "json",
      limit: String(limit),
    });
    const response = await throttledFetch(`${MB_BASE}/artist?${params}`);
    if (!response.ok) {
      log.warn(
        { status: response.status, operation: "searchArtistsByQuery", query },
        "mb artist search non-ok response",
      );
      return [];
    }
    const data = MBArtistSearchResponseSchema.parse(await response.json());
    return data.artists.map((a) => ({
      artistMbid: a.id,
      name: a.name,
      disambiguation: a.disambiguation ?? null,
      type: a.type ?? null,
    }));
  } catch (err) {
    log.warn(
      { err, operation: "searchArtistsByQuery", query },
      "mb artist search failed",
    );
    return [];
  }
}

export async function searchReleasesByQuery(
  query: string,
  limit = 8,
): Promise<ExternalReleaseResult[]> {
  try {
    const fetchLimit = Math.min(limit * 3, 25);
    const params = new URLSearchParams({
      query,
      fmt: "json",
      limit: String(fetchLimit),
    });
    const response = await throttledFetch(
      `${MB_BASE}/release?${params}&inc=artist-credits+release-groups`,
    );
    if (!response.ok) {
      log.warn(
        { status: response.status, operation: "searchReleasesByQuery", query },
        "mb release search non-ok response",
      );
      return [];
    }
    const data = MBReleaseSearchResponseSchema.parse(await response.json());

    const byGroup = new Map<string, typeof data.releases>();
    for (const r of data.releases) {
      const rgId = r["release-group"]?.id ?? r.id;
      const grp = byGroup.get(rgId) ?? [];
      grp.push(r);
      byGroup.set(rgId, grp);
    }

    const results: ExternalReleaseResult[] = [];
    for (const grp of byGroup.values()) {
      const firstRelease = grp[0];
      if (!firstRelease) continue;
      const bestId = pickBestRelease(grp) ?? firstRelease.id;
      const best = grp.find((r) => r.id === bestId) ?? firstRelease;
      results.push({
        releaseMbid: best.id,
        releaseGroupMbid: best["release-group"]?.id ?? null,
        title: best.title,
        artistName: best["artist-credit"]?.[0]?.artist.name ?? "Unknown Artist",
        artistMbid: best["artist-credit"]?.[0]?.artist.id ?? null,
        releaseYear: parseReleaseYear(best.date),
        releaseType: best["release-group"]?.["primary-type"] ?? null,
      });
    }
    return results.slice(0, limit);
  } catch (err) {
    log.warn(
      { err, operation: "searchReleasesByQuery", query },
      "mb release search failed",
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

const recordingDetailCache = new Map<string, MBRecordingDetail | null>();
const recordingDetailInflight = new Map<
  string,
  Promise<MBRecordingDetail | null>
>();

export async function lookupRecording(
  mbid: string,
): Promise<MBRecordingDetail | null> {
  if (recordingDetailCache.has(mbid)) {
    return recordingDetailCache.get(mbid) ?? null;
  }
  const existing = recordingDetailInflight.get(mbid);
  if (existing) return existing;

  const promise = (async (): Promise<MBRecordingDetail | null> => {
    try {
      const response = await throttledFetch(
        `${MB_BASE}/recording/${mbid}?inc=artist-credits+releases+release-groups&fmt=json`,
      );
      if (!response.ok) {
        log.warn(
          { status: response.status, operation: "lookupRecording", recordingMbid: mbid },
          "mb recording lookup non-ok response",
        );
        return null;
      }
      const data = MBRecordingLookupSchema.parse(await response.json());
      const bestReleaseMbid = data.releases?.length
        ? pickBestRelease(data.releases)
        : null;
      const bestRelease =
        data.releases?.find((r) => r.id === bestReleaseMbid) ??
        data.releases?.[0];
      return {
        recordingMbid: mbid,
        title: data.title ?? "",
        artistName: data["artist-credit"]?.[0]?.artist.name ?? null,
        artistMbid: data["artist-credit"]?.[0]?.artist.id ?? null,
        releaseGroupMbid: bestRelease?.["release-group"]?.id ?? null,
        releaseName: bestRelease?.title ?? null,
        releaseYear: parseReleaseYear(bestRelease?.date),
        durationMs: data.length ?? null,
      };
    } catch (err) {
      log.warn(
        { err, operation: "lookupRecording", recordingMbid: mbid },
        "mb recording lookup failed",
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
): Promise<MBReleaseDetails | null> {
  try {
    const response = await throttledFetch(
      `${MB_BASE}/release/${releaseMbid}?inc=recordings+artist-credits+release-groups&fmt=json`,
    );
    if (!response.ok) {
      log.warn(
        { status: response.status, operation: "lookupReleaseDetails", releaseMbid },
        "mb release lookup non-ok response",
      );
      return null;
    }
    const data = MBReleaseLookupSchema.parse(await response.json());
    return {
      tracks: data.media.flatMap((disc) =>
        disc.tracks
          .filter((t) => t.recording.video !== true)
          .map((t) => ({
            discPosition: disc.position,
            trackPosition: t.position,
            recordingMbid: t.recording.id,
            title: t.title,
            durationMs: t.length ?? null,
          })),
      ),
      releaseName: data.title ?? null,
      artistMbid: data["artist-credit"]?.[0]?.artist.id ?? null,
      artistName: data["artist-credit"]?.[0]?.artist.name ?? null,
      releaseGroupMbid: data["release-group"]?.id ?? null,
    };
  } catch (err) {
    log.warn(
      { err, operation: "lookupReleaseDetails", releaseMbid },
      "mb release lookup failed",
    );
    return null;
  }
}

export async function searchReleaseGroupCandidates(
  albumTitle: string,
  artistName: string,
): Promise<string[]> {
  try {
    const params = new URLSearchParams({
      query: `artist:"${artistName}" AND releasegroup:"${albumTitle}"`,
      inc: "releases+artist-credits",
      fmt: "json",
      limit: "5",
    });
    const response = await throttledFetch(`${MB_BASE}/release-group?${params}`);
    if (!response.ok) {
      log.warn(
        {
          status: response.status,
          operation: "searchReleaseGroupCandidates",
          albumTitle,
          artistName,
        },
        "mb release-group search non-ok response",
      );
      return [];
    }
    const data = MBReleaseGroupSearchResponseSchema.parse(
      await response.json(),
    );
    return data["release-groups"]
      .filter((rg) => rg.score >= 80)
      .map((rg) => rg.id);
  } catch (err) {
    log.warn(
      { err, operation: "searchReleaseGroupCandidates", albumTitle, artistName },
      "mb release-group search failed",
    );
    return [];
  }
}

export function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .replace(/[-‐‑‒–—―]/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function lookupExternalAlbum(
  rgMbid: string,
): Promise<ExternalAlbumDetail | null> {
  try {
    const res = await throttledFetch(
      `${MB_BASE}/release-group/${rgMbid}?inc=releases+artist-credits&fmt=json`,
    );
    if (!res.ok) {
      log.warn(
        { status: res.status, operation: "lookupExternalAlbum", releaseGroupMbid: rgMbid },
        "mb release-group lookup non-ok response",
      );
      return null;
    }
    const rg = MBReleaseGroupLookupSchema.parse(await res.json());

    const releases = rg.releases ?? [];
    const releaseMbid = pickBestRelease(releases) ?? releases[0]?.id;
    if (!releaseMbid) return null;

    const canonical = releases.find((r) => r.id === releaseMbid) ?? releases[0];

    const details = await lookupReleaseDetails(releaseMbid);
    if (!details) return null;

    return {
      releaseGroupMbid: rgMbid,
      releaseMbid,
      title: rg.title,
      artistName: rg["artist-credit"]?.[0]?.artist.name ?? "Unknown Artist",
      artistMbid: rg["artist-credit"]?.[0]?.artist.id ?? null,
      releaseYear: parseReleaseYear(canonical?.date),
      releaseType: rg["primary-type"] ?? null,
      tracks: details.tracks,
    };
  } catch (err) {
    log.warn(
      { err, operation: "lookupExternalAlbum", releaseGroupMbid: rgMbid },
      "mb release-group lookup failed",
    );
    return null;
  }
}

function pickBestRelease(
  releases: MBReleaseLike[],
  hint?: { albumTitle: string; releaseYear?: number },
): string | null {
  const officialRelease = releases.filter((r) => r.status === "Official");
  if (officialRelease.length === 0) return null;

  if (hint) {
    const albumTitle = normalizeString(hint.albumTitle);
    const hintMatch = officialRelease.find((r) => {
      if (!r.title || normalizeString(r.title) !== albumTitle) return false;
      if (hint.releaseYear && r.date) {
        return r.date.startsWith(String(hint.releaseYear));
      }
      return true;
    });
    if (hintMatch) return hintMatch.id;
  }

  return (
    [...officialRelease].sort((a, b) => {
      const rankA =
        TYPE_RANK[a["release-group"]?.["primary-type"] ?? "Other"] ?? 4;
      const rankB =
        TYPE_RANK[b["release-group"]?.["primary-type"] ?? "Other"] ?? 4;
      if (rankA !== rankB) return rankA - rankB;
      return (a.date ?? "9999") < (b.date ?? "9999") ? -1 : 1;
    })[0]?.id ?? null
  );
}
