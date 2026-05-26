import {
  popularityScore,
  tokenCoverage,
  type MetadataSearchArtist,
  type MetadataSearchRecording,
  type MetadataSearchRelease,
  type MetadataSearchTopResult,
} from "@staccato/shared";

// Blend weights for the unified-search relevance score. Validated against the
// live mirror + ListenBrainz: coverage (how much of the query the entity's
// identity accounts for) dominates, popularity is the confidence tiebreaker that
// sinks keyword-spam/novelty matches, lexical is a minor nudge. Tunable.
export const RANK_WEIGHTS = {
  coverage: 0.6,
  popularity: 0.3,
  lexical: 0.1,
} as const;

// Combined relevance score for one candidate. lexScore is MB's 0–100 Solr score.
export function combinedScore(
  query: string,
  lexScore: number,
  listenCount: number | null,
  identity: string,
): number {
  return (
    RANK_WEIGHTS.coverage * tokenCoverage(query, identity) +
    RANK_WEIGHTS.popularity * popularityScore(listenCount) +
    RANK_WEIGHTS.lexical * (Math.max(0, lexScore) / 100)
  );
}

// An entity's identity string, against which query coverage is measured.
// Artists are their name; tracks/albums combine title + primary artist — this is
// what routes "Frank Ocean" → artist but "Frank Ocean Lost" → track.
const recIdentity = (r: MetadataSearchRecording) =>
  `${r.title} ${r.artistName}`;
const relIdentity = (r: MetadataSearchRelease) => `${r.title} ${r.artistName}`;

// Items arrive with listenCount already attached by the route; lexScore is the
// per-hit Solr score carried alongside.
export interface RankInputs {
  recordings: Array<{ item: MetadataSearchRecording; lexScore: number }>;
  artists: Array<{ item: MetadataSearchArtist; lexScore: number }>;
  releases: Array<{ item: MetadataSearchRelease; lexScore: number }>;
}

export interface RankResult {
  recordings: MetadataSearchRecording[];
  artists: MetadataSearchArtist[];
  releases: MetadataSearchRelease[];
  topResult: MetadataSearchTopResult | null;
}

// Sort each section by combined score and pick the single best entity across
// all categories as the top result (a {type, mbid} pointer into the sections).
export function rankUnified(query: string, inputs: RankInputs): RankResult {
  const recScored = inputs.recordings.map((x) => ({
    item: x.item,
    type: "recording" as const,
    mbid: x.item.recordingMbid,
    score: combinedScore(
      query,
      x.lexScore,
      x.item.listenCount,
      recIdentity(x.item),
    ),
  }));
  const artScored = inputs.artists.map((x) => ({
    item: x.item,
    type: "artist" as const,
    mbid: x.item.artistMbid,
    score: combinedScore(query, x.lexScore, x.item.listenCount, x.item.name),
  }));
  const relScored = inputs.releases.map((x) => ({
    item: x.item,
    type: "release" as const,
    mbid: x.item.releaseMbid,
    score: combinedScore(
      query,
      x.lexScore,
      x.item.listenCount,
      relIdentity(x.item),
    ),
  }));

  const byScore = (a: { score: number }, b: { score: number }) =>
    b.score - a.score;
  recScored.sort(byScore);
  artScored.sort(byScore);
  relScored.sort(byScore);

  let top: { type: MetadataSearchTopResult["type"]; mbid: string } | null =
    null;
  let topScore = -Infinity;
  for (const c of [...recScored, ...artScored, ...relScored]) {
    if (c.score > topScore) {
      topScore = c.score;
      top = { type: c.type, mbid: c.mbid };
    }
  }

  return {
    recordings: recScored.map((x) => x.item),
    artists: artScored.map((x) => x.item),
    releases: relScored.map((x) => x.item),
    topResult: top,
  };
}
