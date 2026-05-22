// Release-selection policy, moved from the server (musicbrainz/client.ts) so the
// façade can collapse R6's release-group → release hop into one round-trip.
// Prefers Official releases, ranked by release-group primary type then earliest
// date. The release-group lookup's `releases` carry no nested release-group, so
// the type rank falls back to "Other" there (matches the prior server behavior).

const TYPE_RANK: Record<string, number> = {
  Album: 0,
  EP: 1,
  Single: 2,
  Broadcast: 3,
  Other: 4,
};

export function parseReleaseYear(date?: string | null): number | null {
  if (!date) return null;
  const year = parseInt(date.slice(0, 4), 10);
  return Number.isNaN(year) ? null : year;
}

interface ReleaseLike {
  id: string;
  date?: string | null;
  status?: string | null;
  "release-group"?: { "primary-type"?: string | null } | null;
}

export function pickBestRelease(releases: ReleaseLike[]): string | null {
  const official = releases.filter((r) => r.status === "Official");
  if (official.length === 0) return null;

  return (
    [...official].sort((a, b) => {
      const rankA =
        TYPE_RANK[a["release-group"]?.["primary-type"] ?? "Other"] ?? 4;
      const rankB =
        TYPE_RANK[b["release-group"]?.["primary-type"] ?? "Other"] ?? 4;
      if (rankA !== rankB) return rankA - rankB;
      return (a.date ?? "9999") < (b.date ?? "9999") ? -1 : 1;
    })[0]?.id ?? null
  );
}
