import { FastifyPluginAsync } from "fastify";
import {
  searchArtistsByQuery,
  searchRecordingsByQuery,
  searchReleasesByQuery,
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

const searchRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/external", async (request) => {
    const {
      type,
      recording,
      release,
      artist,
      limit: rawLimit,
    } = request.query as {
      type?: string;
      recording?: string;
      release?: string;
      artist?: string;
      limit?: string;
    };

    logger.debug(
      `Beginning external search. Type: ${type}. Recording: ${recording}. Release: ${release}. Artist: ${artist}`,
    );

    const limit = Math.min(Number(rawLimit) || 10, 25);

    if (type === "recording") {
      const parts: string[] = [];
      if (recording?.trim()) parts.push(`recording:"${recording.trim()}"`);
      if (release?.trim()) parts.push(`release:"${release.trim()}"`);
      if (artist?.trim()) parts.push(`artist:"${artist.trim()}"`);
      if (parts.length === 0)
        return { recordings: [], artists: [], releases: [] };

      logger.debug(`Querying mb recordings with parts: ${parts.join(" AND ")}`);
      const recordings = await searchRecordingsByQuery(
        parts.join(" AND "),
        limit,
        MB_PRIORITY.INTERACTIVE,
      );
      logger.debug(
        `Finished querying mb recordings with parts: ${parts.join(" AND ")}. Found ${recordings.length} recordings. Resolving local ids...`,
      );

      const mbids = recordings.map((r) => r.recordingMbid);
      const localMbids = new Set(getLocalTrackMbidsByMbids(mbids));
      logger.debug(`Local ids resolved`);
      // recording results carry releaseMbid (not release-group), so they're
      // returned without cover art — the album lookup endpoint resolves it.
      return {
        recordings: recordings.map((r) => ({
          ...r,
          inLibrary: localMbids.has(r.recordingMbid),
        })),
        artists: [],
        releases: [],
      };
    }

    if (type === "release") {
      const parts: string[] = [];
      if (release?.trim()) parts.push(`release:"${release.trim()}"`);
      if (artist?.trim()) parts.push(`artist:"${artist.trim()}"`);
      if (parts.length === 0)
        return { recordings: [], artists: [], releases: [] };

      logger.debug(`Querying mb releases with parts: ${parts.join(" AND ")}`);
      const releases = await searchReleasesByQuery(
        parts.join(" AND "),
        limit,
        MB_PRIORITY.INTERACTIVE,
      );
      logger.debug(
        `Finished querying mb releases with parts: ${parts.join(" AND ")}. Found ${releases.length} recordings. Attaching cover art...`,
      );
      const withCovers = attachCoverArtByReleaseGroup(releases);
      logger.debug(`Attached cover art`);
      return { recordings: [], artists: [], releases: withCovers };
    }

    if (type === "artist") {
      if (!artist?.trim()) return { recordings: [], artists: [], releases: [] };
      logger.debug(`Querying mb artists for ${artist}`);
      const artists = await searchArtistsByQuery(
        `artist:"${artist.trim()}"`,
        limit,
        MB_PRIORITY.INTERACTIVE,
      );
      logger.debug(`Found ${artists.length} artists. Attaching artist art...`);
      const withImages = await attachArtistImagesByMbid(artists);
      logger.debug(`Artist art attached.`);
      return { recordings: [], artists: withImages, releases: [] };
    }

    return { recordings: [], artists: [], releases: [] };
  });
};

export default searchRoutes;
