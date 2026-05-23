import type {
  IdentifyReleaseCandidate,
  MetadataArtist,
  MetadataArtistCredit,
  MetadataArtistReleaseGroup,
  MetadataRecording,
  MetadataRecordingSearchResult,
  MetadataRelease,
  MetadataReleaseDetail,
  MetadataSearchArtist,
  MetadataSearchRecording,
  MetadataSearchRelease,
} from "@staccato/shared";
import type {
  ArtistCreditEntry,
  ArtistLookup,
  ArtistReleaseGroups,
  ArtistSearchResponse,
  RecordingRich,
  ReleaseLookup,
  ReleaseRich,
  ReleaseSearchResponse,
  ReleaseSearchRich,
} from "./schemas.js";
import { parseReleaseYear, pickBestRelease } from "./pickRelease.js";

export function toArtistCredits(
  raw: ArtistCreditEntry[] | null | undefined,
): MetadataArtistCredit[] {
  if (!raw) return [];
  return raw.map((entry) => ({
    mbid: entry.artist.id,
    name: entry.artist.name,
    joinPhrase: entry.joinphrase ?? null,
  }));
}

function toReleases(
  raw: ReleaseRich[] | null | undefined,
): MetadataRelease[] {
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

export function toMetadataRecording(raw: RecordingRich): MetadataRecording {
  return {
    recordingMbid: raw.id,
    title: raw.title ?? "",
    durationMs: raw.length ?? null,
    video: raw.video ?? false,
    artistCredits: toArtistCredits(raw["artist-credit"]),
    releases: toReleases(raw.releases),
  };
}

// R2: one search hit — the R1 recording shape with the Solr score layered on.
export function toMetadataRecordingSearchResult(
  raw: RecordingRich & { score: number },
): MetadataRecordingSearchResult {
  return { ...toMetadataRecording(raw), score: raw.score };
}

// R4: release + flattened tracklist. Drops video recordings and reshapes the
// nested media[].tracks[] into a flat MetadataReleaseTrack[] (the work the
// server's lookupReleaseDetails used to do). Also reused for R6's tracklist.
export function toMetadataReleaseDetail(
  raw: ReleaseLookup,
): MetadataReleaseDetail {
  const artist = raw["artist-credit"]?.[0]?.artist;
  return {
    releaseName: raw.title ?? null,
    disambiguation: raw.disambiguation ?? null,
    releaseYear: parseReleaseYear(raw.date),
    artistMbid: artist?.id ?? null,
    artistName: artist?.name ?? null,
    releaseGroupMbid: raw["release-group"]?.id ?? null,
    artistCredits: toArtistCredits(raw["artist-credit"]),
    tracks: raw.media.flatMap((disc) =>
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
  };
}

// Summarize a release's media into a human format string:
// "CD", "2 × CD", "CD + DVD", "4 × CD + DVD + 12\" Vinyl". Moved from the
// server (was musicbrainz/client.ts) — the façade now owns this reshaping.
function summarizeFormats(
  media: { format?: string | null }[] | null | undefined,
): string | null {
  if (!media || media.length === 0) return null;
  const counts = new Map<string, number>();
  const order: string[] = [];
  for (const m of media) {
    const f = m.format ?? "Unknown";
    if (!counts.has(f)) order.push(f);
    counts.set(f, (counts.get(f) ?? 0) + 1);
  }
  return order
    .map((f) => {
      const n = counts.get(f) ?? 1;
      return n > 1 ? `${n} × ${f}` : f;
    })
    .join(" + ");
}

// R5: one Identify-dialog row per release (specific pressing). No release-group
// dedup — the user needs every pressing. Track count prefers the release-level
// count, falling back to the summed per-medium counts.
export function toIdentifyReleaseCandidate(
  raw: ReleaseSearchRich["releases"][number],
): IdentifyReleaseCandidate {
  const summed = raw.media?.reduce(
    (sum, m) => sum + (m["track-count"] ?? 0),
    0,
  );
  const trackCount =
    raw["track-count"] ?? (summed && summed > 0 ? summed : null);
  return {
    releaseMbid: raw.id,
    releaseGroupMbid: raw["release-group"]?.id ?? null,
    title: raw.title,
    disambiguation: raw.disambiguation ?? null,
    artistName: raw["artist-credit"]?.[0]?.artist.name ?? "Unknown Artist",
    formatDetail: summarizeFormats(raw.media),
    trackCount,
    country: raw.country ?? null,
    date: raw.date ?? null,
    label: raw["label-info"]?.[0]?.label?.name ?? null,
    releaseType: raw["release-group"]?.["primary-type"] ?? null,
  };
}

// R7: artist detail half.
export function toMetadataArtist(raw: ArtistLookup): MetadataArtist {
  return {
    artistMbid: raw.id,
    name: raw.name,
    disambiguation: raw.disambiguation ?? null,
  };
}

// R7: discography half (one page of release-groups).
export function toMetadataArtistReleaseGroups(
  raw: ArtistReleaseGroups,
): MetadataArtistReleaseGroup[] {
  return raw["release-groups"].map((rg) => ({
    releaseGroupMbid: rg.id,
    title: rg.title,
    firstReleaseDate: rg["first-release-date"] ?? null,
    primaryType: rg["primary-type"] ?? null,
    secondaryTypes: rg["secondary-types"] ?? [],
  }));
}

// R3: one recording search hit, flattened to its best release. Mirrors the
// server's old searchRecordingsByQuery: prefer the Official release ranked by
// pickBestRelease, fall back to the first release. Carries releaseGroupMbid so
// the server can attach cover art to track results.
export function toMetadataSearchRecording(
  raw: RecordingRich,
): MetadataSearchRecording {
  const bestId = raw.releases?.length ? pickBestRelease(raw.releases) : null;
  const release =
    raw.releases?.find((r) => r.id === bestId) ?? raw.releases?.[0] ?? null;
  const artist = raw["artist-credit"]?.[0]?.artist;
  return {
    recordingMbid: raw.id,
    title: raw.title ?? "",
    artistName: artist?.name ?? "Unknown Artist",
    artistMbid: artist?.id ?? null,
    releaseName: release?.title ?? null,
    releaseMbid: release?.id ?? null,
    releaseGroupMbid: release?.["release-group"]?.id ?? null,
    releaseYear: parseReleaseYear(release?.date),
    durationMs: raw.length ?? null,
    // Popularity is attached by the route after the ListenBrainz lookup.
    listenCount: null,
  };
}

// R3: one artist search hit.
export function toMetadataSearchArtist(
  raw: ArtistSearchResponse["artists"][number],
): MetadataSearchArtist {
  return {
    artistMbid: raw.id,
    name: raw.name,
    disambiguation: raw.disambiguation ?? null,
    type: raw.type ?? null,
    listenCount: null,
  };
}

// R3: release search hits deduped to one row per release-group. Mirrors the
// server's old searchReleasesByQuery — group by release-group (fallback release
// id), pick the best pressing per group via pickBestRelease. Returns each row
// paired with the winning pressing's Solr score (used for ranking).
export function toMetadataSearchReleases(
  raw: ReleaseSearchResponse["releases"],
): Array<{ item: MetadataSearchRelease; lexScore: number }> {
  const byGroup = new Map<string, ReleaseSearchResponse["releases"]>();
  for (const r of raw) {
    const groupId = r["release-group"]?.id ?? r.id;
    const group = byGroup.get(groupId) ?? [];
    group.push(r);
    byGroup.set(groupId, group);
  }

  const results: Array<{ item: MetadataSearchRelease; lexScore: number }> = [];
  for (const group of byGroup.values()) {
    const first = group[0];
    if (!first) continue;
    const bestId = pickBestRelease(group) ?? first.id;
    const best = group.find((r) => r.id === bestId) ?? first;
    const artist = best["artist-credit"]?.[0]?.artist;
    results.push({
      item: {
        releaseMbid: best.id,
        releaseGroupMbid: best["release-group"]?.id ?? null,
        title: best.title ?? "",
        artistName: artist?.name ?? "Unknown Artist",
        artistMbid: artist?.id ?? null,
        releaseYear: parseReleaseYear(best.date),
        releaseType: best["release-group"]?.["primary-type"] ?? null,
        listenCount: null,
      },
      lexScore: best.score ?? 0,
    });
  }
  return results;
}
