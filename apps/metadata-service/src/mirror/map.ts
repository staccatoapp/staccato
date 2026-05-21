import type {
  MetadataArtistCredit,
  MetadataRecording,
  MetadataRelease,
} from "@staccato/shared";
import type {
  ArtistCreditEntry,
  RecordingRich,
  ReleaseRich,
} from "./schemas.js";

function toArtistCredits(
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
    artistCredits: toArtistCredits(raw["artist-credit"]),
    releases: toReleases(raw.releases),
  };
}
