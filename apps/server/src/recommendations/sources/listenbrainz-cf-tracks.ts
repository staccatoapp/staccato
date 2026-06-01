import { z } from "zod";
import {
  RecommendedTrackSchema,
  type RecommendedTrack,
} from "@staccato/shared";
import { ensureCoverOnDisk } from "../../coverart/store.js";
import { getTracksByMusicbrainzIds } from "../../db/queries/tracks.js";
import { getCFRecommendations } from "../../listenbrainz/client.js";
import {
  lookupRecording,
  MB_PRIORITY,
  type MBRecordingDetail,
} from "../../musicbrainz/client.js";
import { resolvePreview } from "../../preview/index.js";
import type {
  RecommendationSource,
  RecommendationSourceContext,
} from "../source.js";

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;

export const listenbrainzCfTracksSource: RecommendationSource<
  "cf-tracks",
  RecommendedTrack[],
  RecommendationSourceContext
> = {
  id: "listenbrainz",
  kind: "cf-tracks",
  refreshIntervalMs: SIX_HOURS_MS,
  emptyRetryIntervalMs: ONE_HOUR_MS,
  isEligible: (s) => Boolean(s.listenbrainzToken && s.musicbrainzUsername),
  buildContext: (s) => ({
    listenbrainzToken: s.listenbrainzToken!,
    musicbrainzUsername: s.musicbrainzUsername!,
  }),
  async fetch({ listenbrainzToken, musicbrainzUsername }) {
    const mbids = await getCFRecommendations(
      musicbrainzUsername,
      listenbrainzToken,
    );
    if (!mbids.length) return [];

    const localMap = getTracksByMusicbrainzIds(mbids);
    const nonLocal = mbids.filter((m) => !localMap.has(m));
    const recDetails = await Promise.all(
      nonLocal.map((m) => lookupRecording(m, MB_PRIORITY.BACKGROUND)),
    );
    const recMap = new Map<string, MBRecordingDetail>();
    nonLocal.forEach((mbid, i) => {
      const d = recDetails[i];
      if (d) recMap.set(mbid, d);
    });

    const enrichments = await Promise.all(
      [...recMap.values()].map(async (rec) => {
        const [preview, coverArtUrl] = await Promise.all([
          resolvePreview(rec.recordingMbid, rec.artistName ?? "", rec.title),
          rec.releaseGroupMbid
            ? ensureCoverOnDisk(rec.releaseGroupMbid, MB_PRIORITY.BACKGROUND)
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
            artistMbid: local.artistMbid,
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
          artistMbid: rec.artistMbid,
          albumTitle: rec.releaseName,
          releaseGroupMbid: rec.releaseGroupMbid,
          coverArtUrl: enr?.coverArtUrl ?? null,
          previewUrl: enr?.previewUrl ?? null,
          durationMs: rec.durationMs,
          inLibrary: false,
        };
      })
      .filter((t): t is RecommendedTrack => t !== null);

    return z.array(RecommendedTrackSchema).parse(tracks);
  },
};
