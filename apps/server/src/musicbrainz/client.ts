// TODO - desperately needs cleaning up and splitting out, file is messy, but i cba right now

import throttle from "p-throttle";

export interface RecordingMatch {
  recordingMbid: string;
  releaseMbid: string | null;
  score: number;
  mbArtistName: string | null;
  mbArtistId: string | null;
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
  title: string;
  artistName: string;
  artistMbid: string | null;
  releaseYear: number | null;
  releaseType: string | null;
}

export interface MBReleaseTrack {
  discPosition: number;
  trackPosition: number;
  recordingMbid: string;
  title: string;
}

export interface MBReleaseDetails {
  tracks: MBReleaseTrack[];
  artistMbid: string | null;
  artistName: string | null;
  releaseGroupMbid: string | null;
}

interface MBRelease {
  id: string;
  title: string;
  date?: string;
  status?: string;
  "release-group"?: { "primary-type"?: string };
}

interface MBRecording {
  id: string;
  score: number;
  releases?: MBRelease[];
  "artist-credit"?: Array<{ artist: { id: string; name: string } }>;
}

interface MBRecordingSearchResponse {
  recordings: MBRecording[];
}

interface MBReleaseCandidateMeta {
  id: string;
  status: string | undefined;
  trackCount: number | undefined;
}

const MB_BASE = "https://musicbrainz.org/ws/2";
export const MB_USER_AGENT =
  "Staccato/0.1.0 (https://github.com/staccatoapp/staccato)";

const MB_INTERVAL_MS = parseInt(process.env.MB_RATE_LIMIT_MS ?? "1100", 10);

export const throttledFetch = throttle({ limit: 1, interval: MB_INTERVAL_MS })(
  async (url: string, req?: RequestInit): Promise<Response> =>
    fetch(url, {
      ...req,
      headers: {
        "User-Agent": MB_USER_AGENT,
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
  const artistAndTitleMatch = await attemptRecordingSearch(
    `artist:"${artistName}" AND recording:"${title}"`,
    85,
    hint,
  );
  if (artistAndTitleMatch) return artistAndTitleMatch;

  // then try album + title for cases where files aren't tagged with artist
  // there probably is a cleaner/more reusable way to construct the queries. im just happy it's working atm tbh
  if (hint?.albumTitle) {
    return attemptRecordingSearch(
      `recording:"${title}" AND release:"${hint.albumTitle}"`,
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
    if (!response.ok) return null;
    const data: MBRecordingSearchResponse = await response.json();
    const normalizedHint = hint?.albumTitle
      ? normalizeString(hint.albumTitle)
      : null;
    for (const recording of data.recordings) {
      if (recording.score < minScore) continue;
      if (
        normalizedHint &&
        recording.releases &&
        recording.releases.length > 0
      ) {
        const matchesHint = recording.releases.some(
          (rel) => normalizeString(rel.title) === normalizedHint,
        );
        if (!matchesHint) continue;
      }
      return {
        recordingMbid: recording.id,
        releaseMbid: recording.releases?.length
          ? pickBestRelease(recording.releases, hint)
          : null,
        score: recording.score,
        mbArtistName: recording["artist-credit"]?.[0]?.artist.name ?? null,
        mbArtistId: recording["artist-credit"]?.[0]?.artist.id ?? null,
      };
    }
    return null;
  } catch {
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
    if (!response.ok) return [];
    const data = (await response.json()) as {
      recordings: Array<{
        id: string;
        title: string;
        length?: number;
        "artist-credit"?: Array<{ artist: { id: string; name: string } }>;
        releases?: MBRelease[];
      }>;
    };
    return data.recordings.map((r) => {
      const bestRelease = r.releases?.length
        ? pickBestRelease(r.releases)
        : null;
      const releaseObj =
        r.releases?.find((rel) => rel.id === bestRelease) ?? r.releases?.[0];
      const year = releaseObj?.date
        ? parseInt(releaseObj.date.slice(0, 4), 10)
        : null;
      return {
        recordingMbid: r.id,
        title: r.title,
        artistName: r["artist-credit"]?.[0]?.artist.name ?? "Unknown Artist",
        artistMbid: r["artist-credit"]?.[0]?.artist.id ?? null,
        releaseName: releaseObj?.title ?? null,
        releaseMbid: releaseObj?.id ?? null,
        releaseYear: isNaN(year!) ? null : year,
        durationMs: r.length ?? null,
      };
    });
  } catch {
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
    if (!response.ok) return [];
    const data = (await response.json()) as {
      artists: Array<{
        id: string;
        name: string;
        disambiguation?: string;
        type?: string;
      }>;
    };
    return data.artists.map((a) => ({
      artistMbid: a.id,
      name: a.name,
      disambiguation: a.disambiguation ?? null,
      type: a.type ?? null,
    }));
  } catch {
    return [];
  }
}

export async function searchReleasesByQuery(
  query: string,
  limit = 8,
): Promise<ExternalReleaseResult[]> {
  try {
    const params = new URLSearchParams({
      query,
      fmt: "json",
      limit: String(limit),
    });
    const response = await throttledFetch(
      `${MB_BASE}/release?${params}&inc=artist-credits+release-groups`,
    );
    if (!response.ok) return [];
    const data = (await response.json()) as {
      releases: Array<{
        id: string;
        title: string;
        date?: string;
        "artist-credit"?: Array<{ artist: { id: string; name: string } }>;
        "release-group"?: { "primary-type"?: string };
      }>;
    };
    return data.releases.map((r) => {
      const year = r.date ? parseInt(r.date.slice(0, 4), 10) : null;
      return {
        releaseMbid: r.id,
        title: r.title,
        artistName: r["artist-credit"]?.[0]?.artist.name ?? "Unknown Artist",
        artistMbid: r["artist-credit"]?.[0]?.artist.id ?? null,
        releaseYear: isNaN(year!) ? null : year,
        releaseType: r["release-group"]?.["primary-type"] ?? null,
      };
    });
  } catch {
    return [];
  }
}

export async function lookupReleaseDetails(
  releaseMbid: string,
): Promise<MBReleaseDetails | null> {
  try {
    const response = await throttledFetch(
      `${MB_BASE}/release/${releaseMbid}?inc=recordings+artist-credits+release-groups&fmt=json`,
    );
    if (!response.ok) return null;
    const data = (await response.json()) as {
      "artist-credit"?: Array<{ artist: { id: string; name: string } }>;
      "release-group"?: { id: string };
      media: Array<{
        position: number;
        tracks: Array<{
          position: number;
          title: string;
          recording: { id: string };
        }>;
      }>;
    };
    return {
      tracks: data.media.flatMap((disc) =>
        disc.tracks.map((t) => ({
          discPosition: disc.position,
          trackPosition: t.position,
          recordingMbid: t.recording.id,
          title: t.title,
        })),
      ),
      artistMbid: data["artist-credit"]?.[0]?.artist.id ?? null,
      artistName: data["artist-credit"]?.[0]?.artist.name ?? null,
      releaseGroupMbid: data["release-group"]?.id ?? null,
    };
  } catch {
    return null;
  }
}

export async function searchReleaseCandidates(
  albumTitle: string,
  artistName: string,
  localTrackCount?: number,
): Promise<string[]> {
  let candidates = await searchReleaseMetas(
    `artist:"${artistName}" AND release:"${albumTitle}"`,
    80,
  );
  if (candidates.length === 0) {
    candidates = await searchReleaseMetas(`release:"${albumTitle}"`, 90);
  }
  return sortReleaseCandidates(candidates, localTrackCount).map((c) => c.id);
}

function sortReleaseCandidates(
  candidates: MBReleaseCandidateMeta[],
  localTrackCount?: number,
): MBReleaseCandidateMeta[] {
  return [...candidates].sort((a, b) => {
    const aOff = a.status === "Official" ? 0 : 1;
    const bOff = b.status === "Official" ? 0 : 1;
    if (aOff !== bOff) return aOff - bOff;
    if (
      localTrackCount !== undefined &&
      a.trackCount !== undefined &&
      b.trackCount !== undefined
    ) {
      return (
        Math.abs(a.trackCount - localTrackCount) -
        Math.abs(b.trackCount - localTrackCount)
      );
    }
    return 0;
  });
}

async function searchReleaseMetas(
  queryStr: string,
  minScore: number,
): Promise<MBReleaseCandidateMeta[]> {
  try {
    const query = new URLSearchParams({
      query: queryStr,
      fmt: "json",
      limit: "10",
    });
    const response = await throttledFetch(`${MB_BASE}/release?${query}`);
    if (!response.ok) return [];
    const data = (await response.json()) as {
      releases: Array<{
        id: string;
        score: number;
        status?: string;
        "track-count"?: number;
      }>;
    };
    return data.releases
      .filter((r) => r.score >= minScore)
      .map((r) => ({
        id: r.id,
        status: r.status,
        trackCount: r["track-count"],
      }));
  } catch {
    return [];
  }
}

export function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
}

function pickBestRelease(
  releases: MBRelease[],
  hint?: { albumTitle: string; releaseYear?: number },
): string | null {
  const officialRelease = releases.filter((r) => r.status === "Official");
  if (officialRelease.length === 0) return null;

  if (hint) {
    const albumTitle = normalizeString(hint.albumTitle);
    const hintMatch = officialRelease.find((r) => {
      if (normalizeString(r.title) !== albumTitle) return false;
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
