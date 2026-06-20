import type {
  ExternalReleaseResult,
  RecommendedPlaylistTrack,
  RecommendedTrack,
  UnifiedAlbumDetail,
} from "@staccato/shared";
import React, { useState } from "react";

import { LidarrSheet } from "@/components/explore/lidarr-sheet";
import { ApiError } from "@/lib/api-client";
import { pickGradient } from "@/lib/gradient";
import { useRequestDownload } from "@/hooks/use-request-download";

/**
 * Everything the Lidarr request needs, normalised so both a recommended track
 * and a search-result album can open the same sheet. A subject only exists when
 * the release-group and artist MBIDs are both present (the request is
 * album-level), so callers build it through the helpers below and skip the
 * affordance when they return null.
 */
export interface LidarrSubject {
  releaseGroupMbid: string;
  artistMbid: string;
  artistName: string;
  albumTitle: string | null;
  coverArtUrl: string | null;
  /** Display title — the track title, or the album title for a release. */
  title: string;
}

/** Build a subject from a recommended track, or null if it can't be requested. */
export function subjectFromTrack(
  track: RecommendedTrack,
): LidarrSubject | null {
  if (!track.releaseGroupMbid || !track.artistMbid || !track.artistName) {
    return null;
  }
  return {
    releaseGroupMbid: track.releaseGroupMbid,
    artistMbid: track.artistMbid,
    artistName: track.artistName,
    albumTitle: track.albumTitle,
    coverArtUrl: track.coverArtUrl,
    title: track.title,
  };
}

/**
 * Build a subject from a playlist track (recommended-playlist row), or null when
 * it can't be requested. Same shape as {@link subjectFromTrack}; the recommended
 * playlist-track type just nullable-types its `recordingMbid`.
 */
export function subjectFromPlaylistTrack(
  track: RecommendedPlaylistTrack,
): LidarrSubject | null {
  if (!track.releaseGroupMbid || !track.artistMbid || !track.artistName) {
    return null;
  }
  return {
    releaseGroupMbid: track.releaseGroupMbid,
    artistMbid: track.artistMbid,
    artistName: track.artistName,
    albumTitle: track.albumTitle,
    coverArtUrl: track.coverArtUrl,
    title: track.title,
  };
}

/** Build a subject from a search-result release, or null if not requestable. */
export function subjectFromRelease(
  release: ExternalReleaseResult,
): LidarrSubject | null {
  if (!release.releaseGroupMbid || !release.artistMbid) return null;
  return {
    releaseGroupMbid: release.releaseGroupMbid,
    artistMbid: release.artistMbid,
    artistName: release.artistName,
    albumTitle: release.title,
    coverArtUrl: release.coverArtUrl,
    title: release.title,
  };
}

/**
 * Build a subject from an album-detail payload, or null if not requestable.
 * Only external (MusicBrainz-only) albums carry the `artistMbid` the request
 * needs — local albums omit it, so they return null.
 */
export function subjectFromAlbumDetail(
  detail: UnifiedAlbumDetail,
): LidarrSubject | null {
  if (detail.source !== "external") return null;
  const { releaseGroupMbid, artistMbid, artistName, title, coverArtUrl } =
    detail.album;
  if (!releaseGroupMbid || !artistMbid) return null;
  return {
    releaseGroupMbid,
    artistMbid,
    artistName,
    albumTitle: title,
    coverArtUrl,
    title,
  };
}

interface AddAlbumSheetProps {
  /** Non-null opens the sheet for that subject; null closes it. */
  subject: LidarrSubject | null;
  onClose: () => void;
}

/**
 * Bottom sheet that queues a Lidarr download request for an album. Provided
 * via the sheet store + GlobalSheetHost so it renders above all other overlays.
 */
export function AddAlbumSheet({ subject, onClose }: AddAlbumSheetProps) {
  const request = useRequestDownload();
  const [errored, setErrored] = useState(false);

  // Retain the last subject so its content stays rendered through the close
  // animation (the prop goes null the instant the sheet starts dismissing).
  // Uses React's "adjust state on prop change" pattern (render-phase setState,
  // guarded), so a new subject also clears any stale error.
  const [shown, setShown] = useState<LidarrSubject | null>(subject);
  const [seen, setSeen] = useState<LidarrSubject | null>(subject);
  if (subject !== seen) {
    setSeen(subject);
    if (subject) {
      setShown(subject);
      setErrored(false);
    }
  }

  const open = subject != null;

  if (!shown) return null;

  const subtitle = [shown.artistName, shown.albumTitle]
    .filter(Boolean)
    .join(" · ");

  const submit = () => {
    request.mutate(
      {
        releaseGroupMbid: shown.releaseGroupMbid,
        artistMbid: shown.artistMbid,
        artistName: shown.artistName,
        albumTitle: shown.albumTitle,
      },
      {
        onSuccess: onClose,
        onError: (err) => {
          // 409 = a request for this album is already active; that's a benign
          // "already requested" outcome, so close rather than show an error.
          if (err instanceof ApiError && err.status === 409) {
            onClose();
            return;
          }
          setErrored(true);
        },
      },
    );
  };

  return (
    <LidarrSheet
      open={open}
      onClose={onClose}
      testID="lidarr-sheet"
      backdropTestID="lidarr-sheet-backdrop"
      header={{
        artUrl: shown.coverArtUrl,
        gradientKey: pickGradient(shown.releaseGroupMbid),
        title: shown.title,
        subtitle,
      }}
      info={{
        text: "Additional tracks will be downloaded along with your request.",
        variant: "primary",
      }}
      cta={{
        label: "Request via Lidarr",
        onPress: submit,
        loading: request.isPending,
        testID: "lidarr-sheet-request",
      }}
      error={
        errored ? "Couldn't send the request. Please try again." : undefined
      }
      showCancel
    />
  );
}
