import { FastifyPluginAsync } from "fastify";
import {
  searchExternalUnified,
  MB_PRIORITY,
} from "../musicbrainz/client.js";
import { getLocalTrackMbidsByMbids } from "../db/queries/tracks.js";
import { resolveExternalCoverNow } from "../coverart/store.js";
import { ensureArtistImageOnDisk } from "../artistimage/store.js";
import { logger } from "../logger.js";

function attachCoverArtByReleaseGroup<
  T extends { releaseGroupMbid: string | null },
>(items: T[]): Array<T & { coverArtUrl: string | null }> {
  return items.map((i) => ({
    ...i,
    coverArtUrl: i.releaseGroupMbid
      ? resolveExternalCoverNow(i.releaseGroupMbid, MB_PRIORITY.INTERACTIVE)
      : null,
  }));
}

async function attachArtistImagesByMbid<T extends { artistMbid: string }>(
  items: T[],
): Promise<Array<T & { imageUrl: string | null }>> {
  const mbids = Array.from(new Set(items.map((i) => i.artistMbid)));
  const images = await Promise.all(
    mbids.map(
      async (m) =>
        [m, await ensureArtistImageOnDisk(m, MB_PRIORITY.INTERACTIVE)] as const,
    ),
  );
  const imageMap = new Map(images);
  return items.map((i) => ({
    ...i,
    imageUrl: imageMap.get(i.artistMbid) ?? null,
  }));
}

const EMPTY = { recordings: [], artists: [], releases: [] };

const searchRoutes: FastifyPluginAsync = async (fastify) => {
  // Unified free-text search (R3). One façade call fans out across the
  // recording/artist/release indexes; the server adds local-library marking,
  // cover art, and artist images. Replaces the old per-type field-scoped search.
  fastify.get("/external", async (request) => {
    const { q, limit: rawLimit } = request.query as {
      q?: string;
      limit?: string;
    };

    const query = q?.trim() ?? "";
    if (query.length < 2) return EMPTY;

    const limit = Math.min(Number(rawLimit) || 10, 25);
    logger.debug(`Beginning external search. Query: ${query}`);

    const results = await searchExternalUnified(
      query,
      limit,
      MB_PRIORITY.INTERACTIVE,
    );
    if (!results) return EMPTY;

    // Tracks: mark in-library and attach cover art (recordings now carry their
    // best release's release-group, the Cover Art Archive key).
    const localMbids = new Set(
      getLocalTrackMbidsByMbids(results.recordings.map((r) => r.recordingMbid)),
    );
    const recordings = results.recordings.map((r) => ({
      recordingMbid: r.recordingMbid,
      title: r.title,
      artistName: r.artistName,
      artistMbid: r.artistMbid,
      releaseName: r.releaseName,
      releaseMbid: r.releaseMbid,
      releaseYear: r.releaseYear,
      durationMs: r.durationMs,
      inLibrary: localMbids.has(r.recordingMbid),
      coverArtUrl: r.releaseGroupMbid
        ? resolveExternalCoverNow(r.releaseGroupMbid, MB_PRIORITY.INTERACTIVE)
        : null,
    }));

    const artists = await attachArtistImagesByMbid(results.artists);
    const releases = attachCoverArtByReleaseGroup(results.releases);

    logger.debug(
      `External search done. ${recordings.length} tracks, ${releases.length} albums, ${artists.length} artists.`,
    );
    return { recordings, artists, releases };
  });
};

export default searchRoutes;
