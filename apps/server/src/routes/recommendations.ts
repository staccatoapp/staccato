import { FastifyPluginAsync } from "fastify";
import type { RecommendedPlaylist, RecommendedTrack } from "@staccato/shared";
import {
  RecommendedTrackSchema,
  RecommendedPlaylistSchema,
} from "@staccato/shared";
import { z } from "zod";
import {
  refreshPlaylistsInLibrary,
  refreshTracksInLibrary,
} from "../recommendations/in-library.js";
import "../recommendations/sources/index.js";
import { buildResponse } from "../recommendations/cache.js";

function mergeTracks(payloads: RecommendedTrack[][]): RecommendedTrack[] {
  const seen = new Set<string>();
  const out: RecommendedTrack[] = [];
  for (const list of payloads) {
    for (const t of list) {
      if (seen.has(t.recordingMbid)) continue;
      seen.add(t.recordingMbid);
      out.push(t);
    }
  }
  return out;
}

function mergePlaylists(
  payloads: RecommendedPlaylist[][],
): RecommendedPlaylist[] {
  const seen = new Set<string>();
  const out: RecommendedPlaylist[] = [];
  for (const list of payloads) {
    for (const p of list) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      out.push(p);
    }
  }
  return out;
}

const recommendationRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/tracks", async (req) => {
    const response = buildResponse<RecommendedTrack[]>(
      req.userId,
      "cf-tracks",
      z.array(RecommendedTrackSchema),
      mergeTracks,
      refreshTracksInLibrary,
    );
    return response;
  });

  fastify.get("/playlists", async (req) => {
    const response = buildResponse<RecommendedPlaylist[]>(
      req.userId,
      "playlists",
      z.array(RecommendedPlaylistSchema),
      mergePlaylists,
      refreshPlaylistsInLibrary,
    );
    return response;
  });
};

export default recommendationRoutes;
