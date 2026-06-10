import type { FastifyBaseLogger } from "fastify";
import type { RecommendedPlaylistTrack } from "@staccato/shared";
import { getPlaylistTracksForSeeding } from "../../db/queries/playlists.js";
import {
  candidateNameKey,
  resolveCandidates,
} from "../inhouse/resolution/resolve.js";
import { buildSeeds } from "./seeds.js";
import { aggregateSimilar } from "./similarity.js";

/** Compute a playlist's ranked track-suggestions: seed from its tracks, fan out
 * Last.fm track.getSimilar, aggregate by overlap, resolve to MBIDs (reusing the
 * in-house resolution nucleus), and return a flat ordered RecommendedPlaylistTrack
 * list. Empty on cold-start or when nothing resolves. (SP3 design §5–§7.) */
export async function computeSuggestions(
  playlistId: string,
  log: FastifyBaseLogger,
): Promise<RecommendedPlaylistTrack[]> {
  const rows = getPlaylistTracksForSeeding(playlistId);
  const seeds = buildSeeds(rows);
  if (seeds.length === 0) {
    log.info(
      { playlistId, trackCount: rows.length },
      "playlist suggestions: cold-start, no seeds",
    );
    return [];
  }

  const ranked = await aggregateSimilar(
    seeds,
    rows.map((r) => ({
      recordingMbid: r.recordingMbid,
      artist: r.artistName,
      title: r.title,
    })),
    log,
  );
  if (ranked.length === 0) {
    log.info(
      { playlistId, seedCount: seeds.length },
      "playlist suggestions: no candidates after aggregation",
    );
    return [];
  }

  const resolved = await resolveCandidates(ranked, log);
  const tracks: RecommendedPlaylistTrack[] = [];
  for (const c of ranked) {
    const t = resolved.get(candidateNameKey(c.artist, c.name));
    if (t) tracks.push(t);
  }
  log.info(
    { playlistId, resolved: tracks.length, candidates: ranked.length },
    "playlist suggestions resolved",
  );
  return tracks;
}
