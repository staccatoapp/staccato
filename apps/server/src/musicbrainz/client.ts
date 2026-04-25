import throttle from "p-throttle";

export interface RecordingMatch {
  recordingMbid: string;
  releaseMbid: string | null;
  score: number;
}

export interface ReleaseMatch {
  releaseMbid: string;
  score: number;
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
}

interface MBRecordingSearchResponse {
  recordings: MBRecording[];
}

interface MBReleaseSearchResponse {
  releases: Array<{ id: string; score: number }>;
}

const MB_BASE = "https://musicbrainz.org/ws/2";
export const MB_USER_AGENT =
  "Staccato/0.1.0 (https://github.com/staccatoapp/staccato)";

export const throttledFetch = throttle({ limit: 1, interval: 1100 })(
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

export async function searchRecording(
  artistName: string,
  title: string,
  hint?: { albumTitle: string; releaseYear?: number },
): Promise<RecordingMatch | null> {
  try {
    const query = new URLSearchParams({
      query: `artist:"${artistName}" AND recording:"${title}"`,
      fmt: "json",
      limit: "5",
    });
    const response = await throttledFetch(
      `${MB_BASE}/recording?${query}&inc=releases+release-groups`,
    );
    if (!response.ok) return null;
    const data: MBRecordingSearchResponse = await response.json();
    const recording = data.recordings.find((r) => r.score >= 85);
    if (!recording) return null;
    return {
      recordingMbid: recording.id,
      releaseMbid: recording.releases?.length
        ? pickBestRelease(recording.releases, hint)
        : null,
      score: recording.score,
    };
  } catch {
    return null;
  }
}

// TODO - both this and searchRecording use the artistName, which the initial scan sometimes gets wrong (e.g "blink-182" vs "Blink 182"). basically metadata fetching is balls right now and i need to fix it
// TODO - desperately needs a refactor
export async function searchRelease(
  albumTitle: string,
  artistName: string,
): Promise<ReleaseMatch | null> {
  try {
    const query = new URLSearchParams({
      query: `artist:"${artistName}" AND release:"${albumTitle}"`,
      fmt: "json",
      limit: "5",
    });
    const response = await throttledFetch(`${MB_BASE}/release?${query}`);
    if (!response.ok) return null;
    const data: MBReleaseSearchResponse = await response.json();
    const release = data.releases.find((r) => r.score >= 85);
    if (!release) return null;
    return { releaseMbid: release.id, score: release.score };
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

function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
}

// TODO - just picking first release if no official release is present is horrible. might need to increase limit in the query
function pickBestRelease(
  releases: MBRelease[],
  hint?: { albumTitle: string; releaseYear?: number },
): string | null {
  const officialRelease = releases.filter((r) => r.status === "Official");
  if (officialRelease.length === 0) return releases[0]?.id ?? null;

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
