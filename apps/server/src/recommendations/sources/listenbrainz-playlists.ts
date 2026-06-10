import { z } from "zod";
import {
  RecommendedPlaylistSchema,
  type RecommendedPlaylist,
  type RecommendedPlaylistTrack,
} from "@staccato/shared";
import { ensureCoverOnDisk } from "../../coverart/store.js";
import { getTracksByMusicbrainzIds } from "../../db/queries/tracks.js";
import {
  getPlaylistDetail,
  getRecommendedPlaylists,
} from "../../listenbrainz/client.js";
import {
  lookupRecording,
  MB_PRIORITY,
  type MBRecordingDetail,
} from "../../musicbrainz/client.js";
import type {
  RecommendationSource,
  RecommendationSourceContext,
} from "../source.js";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export const listenbrainzPlaylistsSource: RecommendationSource<
  "playlists",
  RecommendedPlaylist[],
  RecommendationSourceContext
> = {
  id: "listenbrainz",
  kind: "playlists",
  refreshIntervalMs: ONE_DAY_MS,
  isEligible: (s) => Boolean(s.listenbrainzToken && s.musicbrainzUsername),
  buildContext: (s) => ({
    listenbrainzToken: s.listenbrainzToken!,
    musicbrainzUsername: s.musicbrainzUsername!,
  }),
  async fetch({ listenbrainzToken, musicbrainzUsername }) {
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
      nonLocal.map((m) => lookupRecording(m, MB_PRIORITY.BACKGROUND)),
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
      rgList.map((rg) => ensureCoverOnDisk(rg, MB_PRIORITY.BACKGROUND)),
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
              artistMbid: null,
              albumTitle: t.albumTitle,
              releaseGroupMbid: null,
              durationMs: t.durationMs,
              coverArtUrl: null,
              inLibrary: false,
              localTrackId: null,
            };
          }
          const local = localMap.get(t.recordingMbid);
          if (local) {
            return {
              recordingMbid: t.recordingMbid,
              title: t.title,
              artistName: t.artistName ?? local.artistName,
              artistMbid: local.artistMbid,
              albumTitle: t.albumTitle ?? local.albumTitle,
              releaseGroupMbid: local.releaseGroupMbid,
              durationMs: t.durationMs ?? local.durationMs,
              coverArtUrl: local.coverArtUrl,
              inLibrary: true,
              localTrackId: local.trackId,
            };
          }
          const rec = recMap.get(t.recordingMbid);
          const trackCoverArtUrl = rec?.releaseGroupMbid
            ? (coverArtMap.get(rec.releaseGroupMbid) ?? null)
            : null;
          return {
            recordingMbid: t.recordingMbid,
            title: t.title,
            artistName: t.artistName,
            artistMbid: rec?.artistMbid ?? null,
            albumTitle: t.albumTitle,
            releaseGroupMbid: rec?.releaseGroupMbid ?? null,
            durationMs: t.durationMs,
            coverArtUrl: trackCoverArtUrl,
            inLibrary: false,
            localTrackId: null,
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
          source: "listenbrainz",
        };
      },
    );

    return z.array(RecommendedPlaylistSchema).parse(results);
  },
};
