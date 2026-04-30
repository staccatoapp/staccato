import { FastifyPluginAsync } from "fastify";
import type { RecommendedPlaylist, RecommendedTrack } from "@staccato/shared";
import { getOrCreateUserSettings } from "../db/queries/settings.js";
import { getTrackByMusicbrainzId } from "../db/queries/tracks.js";
import {
  getCFRecommendations,
  getPlaylistDetail,
  getRecommendedPlaylists,
} from "../listenbrainz/client.js";
import { lookupRecording } from "../musicbrainz/client.js";
import { fetchCoverArtUrlForGroup } from "../coverart/client.js";
import { resolvePreview } from "../preview/index.js";
import { playlistCache, trackCache } from "../recommendations/cache.js";

const recommendationRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/playlists", async (req, reply) => {
    const settings = getOrCreateUserSettings(req.userId);
    if (!settings.listenbrainzToken || !settings.musicbrainzUsername) {
      return reply.send({ error: "no-id" });
    }

    const cached = playlistCache.get(req.userId);
    if (cached) return cached;

    const summaries = await getRecommendedPlaylists(
      settings.musicbrainzUsername,
      settings.listenbrainzToken,
    );

    const results: RecommendedPlaylist[] = (
      await Promise.all(
        summaries.map(async (s) => {
          const detail = await getPlaylistDetail(
            s.id,
            settings.listenbrainzToken!,
          );
          if (!detail) return null;

          const firstMbid =
            detail.tracks.find((t) => t.recordingMbid)?.recordingMbid ?? null;
          let coverArtUrl: string | null = null;
          if (firstMbid) {
            const rec = await lookupRecording(firstMbid);
            if (rec?.releaseGroupMbid) {
              coverArtUrl = await fetchCoverArtUrlForGroup(
                rec.releaseGroupMbid,
              );
            }
          }

          return {
            id: s.id,
            name: s.title,
            description: s.description,
            trackCount: detail.tracks.length,
            tracks: await Promise.all(
              detail.tracks.map(async (t) => {
                if (t.recordingMbid) {
                  const local = getTrackByMusicbrainzId(t.recordingMbid);
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
                }
                let trackCoverArtUrl: string | null = null;
                if (t.recordingMbid) {
                  const rec = await lookupRecording(t.recordingMbid);
                  if (rec?.releaseGroupMbid) {
                    trackCoverArtUrl = await fetchCoverArtUrlForGroup(rec.releaseGroupMbid);
                  }
                }
                return {
                  recordingMbid: t.recordingMbid,
                  title: t.title,
                  artistName: t.artistName,
                  albumTitle: t.albumTitle,
                  durationMs: t.durationMs,
                  coverArtUrl: trackCoverArtUrl,
                  inLibrary: false,
                };
              }),
            ),
            coverArtUrl,
            expiresAt: s.expiresAt,
          } satisfies RecommendedPlaylist;
        }),
      )
    ).filter((r): r is RecommendedPlaylist => r !== null);

    const firstExpiry = summaries.find((s) => s.expiresAt)?.expiresAt ?? null;
    playlistCache.set(req.userId, results, firstExpiry);
    return results;
  });

  fastify.get("/tracks", async (req, reply) => {
    const settings = getOrCreateUserSettings(req.userId);
    if (!settings.listenbrainzToken || !settings.musicbrainzUsername) {
      return reply.send({ error: "no-id" });
    }

    const cached = trackCache.get(req.userId);
    if (cached) return cached;

    const mbids = await getCFRecommendations(
      settings.musicbrainzUsername,
      settings.listenbrainzToken,
    );
    if (!mbids.length) {
      return reply.send({ error: "no-listens" });
    }

    const tracks: RecommendedTrack[] = (
      await Promise.all(
        mbids.map(async (mbid) => {
          const local = getTrackByMusicbrainzId(mbid);
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
            } satisfies RecommendedTrack;
          }
          const rec = await lookupRecording(mbid);
          if (!rec) return null;
          const [preview, coverArtUrl] = await Promise.all([
            resolvePreview(mbid, rec.artistName ?? "", rec.title),
            rec.releaseGroupMbid
              ? fetchCoverArtUrlForGroup(rec.releaseGroupMbid)
              : null,
          ]);
          return {
            recordingMbid: mbid,
            title: rec.title,
            artistName: rec.artistName,
            albumTitle: rec.releaseName,
            releaseGroupMbid: rec.releaseGroupMbid,
            coverArtUrl,
            previewUrl: preview.previewUrl,
            durationMs: rec.durationMs,
            inLibrary: false,
          } satisfies RecommendedTrack;
        }),
      )
    ).filter((t): t is RecommendedTrack => t !== null);

    trackCache.set(req.userId, tracks, null);
    return tracks;
  });
};

export default recommendationRoutes;
