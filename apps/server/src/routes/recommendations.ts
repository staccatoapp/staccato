import { FastifyPluginAsync } from "fastify";
import type {
  RecommendedPlaylist,
  RecommendedPlaylistTrack,
  RecommendedTrack,
} from "@staccato/shared";
import { getOrCreateUserSettings } from "../db/queries/settings.js";
import { getTracksByMusicbrainzIds } from "../db/queries/tracks.js";
import {
  getCFRecommendations,
  getPlaylistDetail,
  getRecommendedPlaylists,
} from "../listenbrainz/client.js";
import {
  lookupRecording,
  type MBRecordingDetail,
} from "../musicbrainz/client.js";
import { fetchCoverArtUrlForGroup } from "../coverart/client.js";
import { resolvePreview } from "../preview/index.js";
import { playlistCache, trackCache } from "../recommendations/cache.js";

const recommendationRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/playlists", async (req, reply) => {
    const settings = getOrCreateUserSettings(req.userId);
    if (!settings.listenbrainzToken || !settings.musicbrainzUsername) {
      return reply.send({ error: "no-id" });
    }
    const { listenbrainzToken, musicbrainzUsername } = settings;

    return playlistCache.getOrCompute(req.userId, async () => {
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
      const recDetails = await Promise.all(nonLocal.map(lookupRecording));
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
        rgList.map(fetchCoverArtUrlForGroup),
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
          } satisfies RecommendedPlaylist;
        },
      );

      const firstExpiry = summaries.find((s) => s.expiresAt)?.expiresAt ?? null;
      return { data: results, expiresAt: firstExpiry };
    });
  });

  fastify.get("/tracks", async (req, reply) => {
    const settings = getOrCreateUserSettings(req.userId);
    if (!settings.listenbrainzToken || !settings.musicbrainzUsername) {
      return reply.send({ error: "no-id" });
    }
    const { listenbrainzToken, musicbrainzUsername } = settings;

    const cached = trackCache.get(req.userId);
    if (cached) return cached;

    const mbids = await getCFRecommendations(
      musicbrainzUsername,
      listenbrainzToken,
    );
    if (!mbids.length) {
      return reply.send({ error: "no-listens" });
    }

    return trackCache.getOrCompute(req.userId, async () => {
      const localMap = getTracksByMusicbrainzIds(mbids);
      const nonLocal = mbids.filter((m) => !localMap.has(m));
      const recDetails = await Promise.all(nonLocal.map(lookupRecording));
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
              ? fetchCoverArtUrlForGroup(rec.releaseGroupMbid)
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

      return { data: tracks, expiresAt: null };
    });
  });
};

export default recommendationRoutes;
