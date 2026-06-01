import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type {
  RecommendationsResponse,
  RecommendedPlaylist,
  RecommendedTrack,
} from "@staccato/shared";
import {
  RecommendedTrackSchema,
  RecommendedPlaylistSchema,
} from "@staccato/shared";
import { getOrCreateUserSettings } from "../db/queries/settings.js";
import {
  findRowsForUserKind,
  upsertWarmingRow,
} from "../db/queries/recommendation-cache.js";
import type { RecommendationCacheRow } from "../db/schema/recommendation-cache.js";
import {
  refreshPlaylistsInLibrary,
  refreshTracksInLibrary,
} from "../recommendations/in-library.js";
import { listRegisteredSources } from "../recommendations/source.js";
import "../recommendations/sources/index.js";
import { logger } from "../logger.js";

function parsePayload<T>(
  row: RecommendationCacheRow,
  schema: z.ZodType<T>,
): T | null {
  if (!row.payload) return null;
  try {
    const parsed = JSON.parse(row.payload);
    const result = schema.safeParse(parsed);
    if (!result.success) {
      logger.warn(
        { source: row.source, kind: row.kind, errors: result.error.issues },
        "recommendation cache payload failed validation",
      );
      return null;
    }
    return result.data;
  } catch (err) {
    logger.warn(
      { err, source: row.source, kind: row.kind },
      "recommendation cache payload failed to parse",
    );
    return null;
  }
}

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

function buildResponse<T extends unknown[]>(
  userId: string,
  kind: string,
  schema: z.ZodType<T>,
  merge: (payloads: T[]) => T,
  applyLiveLibrary: (merged: T) => T,
): RecommendationsResponse<T> {
  const settings = getOrCreateUserSettings(userId);
  const eligibleSources = listRegisteredSources().filter(
    (s) => s.kind === kind && s.isEligible(settings),
  );
  if (eligibleSources.length === 0) {
    return { status: "no-token" };
  }

  const rows = findRowsForUserKind(userId, kind);
  if (rows.length === 0) {
    for (const source of eligibleSources) {
      upsertWarmingRow(userId, source.id, source.kind);
    }
    return { status: "warming" };
  }

  const allWarmingNullPayload = rows.every(
    (r) => r.status === "warming" && !r.payload,
  );
  if (allWarmingNullPayload) {
    return { status: "warming" };
  }

  const withPayload = rows.filter((r) => r.payload !== null);
  const payloads = withPayload
    .map((r) => parsePayload(r, schema))
    .filter((p): p is T => p !== null);

  const merged = applyLiveLibrary(merge(payloads));

  const allError = rows.every((r) => r.status === "error");
  if (allError) {
    return { status: "error", data: merged.length ? merged : null };
  }

  return { status: "ready", data: merged };
}

export default recommendationRoutes;
