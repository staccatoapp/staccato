import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  RecommendedPlaylistSchema,
  RecommendedTrackSchema,
  type RecommendedPlaylist,
  type RecommendedPlaylistTrack,
  type RecommendedTrack,
} from "@staccato/shared";
import { getOrCreateUserSettings } from "../db/queries/settings.js";
import {
  getLocalTrackMbidsByMbids,
  getTracksByMusicbrainzIds,
} from "../db/queries/tracks.js";
import {
  getCFRecommendations,
  getPlaylistDetail,
  getRecommendedPlaylists,
} from "../listenbrainz/client.js";
import {
  lookupRecording,
  MB_PRIORITY,
  type MBRecordingDetail,
} from "../musicbrainz/client.js";
import { ensureCoverOnDisk } from "../coverart/store.js";
import { resolvePreview } from "../preview/index.js";
import { playlistCache, trackCache } from "../recommendations/cache.js";

// inLibrary is not safe to cache: a track can transition into the local
// library at any point (download completion, library scan, manual import).
// Re-resolve from the live DB on every serve so the user sees the truth.
function refreshTracksInLibrary(
  tracks: RecommendedTrack[],
): RecommendedTrack[] {
  if (tracks.length === 0) return tracks;
  const localSet = new Set(
    getLocalTrackMbidsByMbids(tracks.map((t) => t.recordingMbid)),
  );
  return tracks.map((t) => ({
    ...t,
    inLibrary: localSet.has(t.recordingMbid),
  }));
}

function refreshPlaylistsInLibrary(
  playlists: RecommendedPlaylist[],
): RecommendedPlaylist[] {
  const allMbids: string[] = [];
  for (const p of playlists) {
    for (const t of p.tracks) {
      if (t.recordingMbid) allMbids.push(t.recordingMbid);
    }
  }
  if (allMbids.length === 0) return playlists;
  const localSet = new Set(getLocalTrackMbidsByMbids(allMbids));
  return playlists.map((p) => ({
    ...p,
    tracks: p.tracks.map((t) => ({
      ...t,
      inLibrary: t.recordingMbid ? localSet.has(t.recordingMbid) : false,
    })),
  }));
}

const recommendationRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/playlists", async (req, reply) => {
    const settings = getOrCreateUserSettings(req.userId);
    if (!settings.listenbrainzToken || !settings.musicbrainzUsername) {
      return reply.send({ error: "no-id" });
    }
    const { listenbrainzToken, musicbrainzUsername } = settings;

    const playlists = await playlistCache.getOrCompute(req.userId, async () => {
      const summaries = await getRecommendedPlaylists(
        musicbrainzUsername,
        listenbrainzToken,
      );

      const detailResults = await Promise.all(
        summaries.map(async (summary) => {
          const detail = await getPlaylistDetail(summary.id, listenbrainzToken);
          return detail ? { summary, detail } : null;
        }),
      );
      const playlists = detailResults.filter(
        (d): d is NonNullable<typeof d> => d !== null,
      );

      const allMbids = new Set<string>();
      for (const { detail } of playlists) {
        for (const t of detail.tracks) {
          if (t.recordingMbid) allMbids.add(t.recordingMbid);
        }
      }
      const mbidList = [...allMbids];
      const localMap = getTracksByMusicbrainzIds(mbidList);

      const nonLocal = mbidList.filter((m) => !localMap.has(m));
      const recDetails = await Promise.all(
        nonLocal.map((m) => lookupRecording(m, MB_PRIORITY.PAGE_LOAD)),
      );
      const recMap = new Map<string, MBRecordingDetail>();
      nonLocal.forEach((mbid, i) => {
        const d = recDetails[i];
        if (d) recMap.set(mbid, d);
      });

      const rgSet = new Set<string>();
      for (const rec of recMap.values()) {
        if (rec.releaseGroupMbid) rgSet.add(rec.releaseGroupMbid);
      }
      const rgList = [...rgSet];
      const coverArtResults = await Promise.all(
        rgList.map((rg) => ensureCoverOnDisk(rg, MB_PRIORITY.PAGE_LOAD)),
      );
      const coverArtMap = new Map(
        rgList.map((rg, i) => [rg, coverArtResults[i] ?? null]),
      );

      const results: RecommendedPlaylist[] = playlists.map(
        ({ summary, detail }) => {
          const tracks: RecommendedPlaylistTrack[] = detail.tracks.map((t) => {
            if (!t.recordingMbid) {
              return {
                recordingMbid: null,
                title: t.title,
                artistName: t.artistName,
                albumTitle: t.albumTitle,
                durationMs: t.durationMs,
                coverArtUrl: null,
                inLibrary: false,
              };
            }
            const local = localMap.get(t.recordingMbid);
            if (local) {
              return {
                recordingMbid: t.recordingMbid,
                title: t.title,
                artistName: t.artistName ?? local.artistName,
                albumTitle: t.albumTitle ?? local.albumTitle,
                durationMs: t.durationMs ?? local.durationMs,
                coverArtUrl: local.coverArtUrl,
                inLibrary: true,
              };
            }
            const rec = recMap.get(t.recordingMbid);
            const trackCoverArtUrl = rec?.releaseGroupMbid
              ? coverArtMap.get(rec.releaseGroupMbid) ?? null
              : null;
            return {
              recordingMbid: t.recordingMbid,
              title: t.title,
              artistName: t.artistName,
              albumTitle: t.albumTitle,
              durationMs: t.durationMs,
              coverArtUrl: trackCoverArtUrl,
              inLibrary: false,
            };
          });

          const firstWithMbid = detail.tracks.find((t) => t.recordingMbid);
          let playlistCoverArtUrl: string | null = null;
          if (firstWithMbid?.recordingMbid) {
            const mbid = firstWithMbid.recordingMbid;
            const local = localMap.get(mbid);
            if (local?.coverArtUrl) {
              playlistCoverArtUrl = local.coverArtUrl;
            } else {
              const rec = recMap.get(mbid);
              if (rec?.releaseGroupMbid) {
                playlistCoverArtUrl =
                  coverArtMap.get(rec.releaseGroupMbid) ?? null;
              }
            }
          }

          return {
            id: summary.id,
            name: summary.title,
            description: summary.description,
            trackCount: detail.tracks.length,
            tracks,
            coverArtUrl: playlistCoverArtUrl,
            expiresAt: summary.expiresAt,
          };
        },
      );

      const firstExpiry = summaries.find((s) => s.expiresAt)?.expiresAt ?? null;
      return {
        data: z.array(RecommendedPlaylistSchema).parse(results),
        expiresAt: firstExpiry,
      };
    });

    return refreshPlaylistsInLibrary(playlists);
  });

  fastify.get("/tracks", async (req, reply) => {
    const settings = getOrCreateUserSettings(req.userId);
    if (!settings.listenbrainzToken || !settings.musicbrainzUsername) {
      return reply.send({ error: "no-id" });
    }
    const { listenbrainzToken, musicbrainzUsername } = settings;

    const cached = await trackCache.getOrCompute(req.userId, async () => {
      const mbids = await getCFRecommendations(
        musicbrainzUsername,
        listenbrainzToken,
      );
      if (!mbids.length) {
        // Cache the no-listens sentinel for 1h so a user who follows troi-bot
        // afterwards gets fresh recommendations within an hour rather than 24h.
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
        return { data: { error: "no-listens" as const }, expiresAt };
      }

      const localMap = getTracksByMusicbrainzIds(mbids);
      const nonLocal = mbids.filter((m) => !localMap.has(m));
      const recDetails = await Promise.all(
        nonLocal.map((m) => lookupRecording(m, MB_PRIORITY.PAGE_LOAD)),
      );
      const recMap = new Map<string, MBRecordingDetail>();
      nonLocal.forEach((mbid, i) => {
        const d = recDetails[i];
        if (d) recMap.set(mbid, d);
      });

      const enrichments = await Promise.all(
        [...recMap.values()].map(async (rec) => {
          const [preview, coverArtUrl] = await Promise.all([
            resolvePreview(
              rec.recordingMbid,
              rec.artistName ?? "",
              rec.title,
            ),
            rec.releaseGroupMbid
              ? ensureCoverOnDisk(rec.releaseGroupMbid, MB_PRIORITY.PAGE_LOAD)
              : Promise.resolve<string | null>(null),
          ]);
          return {
            mbid: rec.recordingMbid,
            previewUrl: preview.previewUrl,
            coverArtUrl,
          };
        }),
      );
      const enrichMap = new Map(enrichments.map((e) => [e.mbid, e]));

      const tracks = mbids
        .map<RecommendedTrack | null>((mbid) => {
          const local = localMap.get(mbid);
          if (local) {
            return {
              recordingMbid: mbid,
              title: local.title,
              artistName: local.artistName,
              albumTitle: local.albumTitle,
              releaseGroupMbid: local.releaseGroupMbid,
              coverArtUrl: local.coverArtUrl,
              previewUrl: null,
              durationMs: local.durationMs,
              inLibrary: true,
            };
          }
          const rec = recMap.get(mbid);
          if (!rec) return null;
          const enr = enrichMap.get(mbid);
          return {
            recordingMbid: mbid,
            title: rec.title,
            artistName: rec.artistName,
            albumTitle: rec.releaseName,
            releaseGroupMbid: rec.releaseGroupMbid,
            coverArtUrl: enr?.coverArtUrl ?? null,
            previewUrl: enr?.previewUrl ?? null,
            durationMs: rec.durationMs,
            inLibrary: false,
          };
        })
        .filter((t): t is RecommendedTrack => t !== null);

      return {
        data: z.array(RecommendedTrackSchema).parse(tracks),
        expiresAt: null,
      };
    });

    if ("error" in cached) return cached;
    return refreshTracksInLibrary(cached);
  });
};

export default recommendationRoutes;
