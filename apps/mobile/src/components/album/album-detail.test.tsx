import type { UnifiedAlbumDetail } from "@staccato/shared";
import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";

import { StaccatoThemeProvider } from "@/theme";
import { AlbumDetail } from "./album-detail";

const mockUsePreview = jest.fn();
jest.mock("@/providers/preview-provider", () => ({
  usePreview: () => mockUsePreview(),
}));

const mockUsePlayback = jest.fn();
jest.mock("@/providers/playback-provider", () => ({
  usePlayback: () => mockUsePlayback(),
}));

jest.mock("@/lib/session", () => ({
  useSession: () => ({
    session: { serverUrl: "https://music.home.arpa", token: "tok" },
  }),
}));

// Keep the "More by artist" rail out of the way (no extra albums).
jest.mock("@/hooks/use-artist-detail", () => ({
  useArtistDetail: () => ({ data: undefined }),
}));

let playTracks: jest.Mock;
let togglePlay: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  playTracks = jest.fn();
  togglePlay = jest.fn();
  mockUsePreview.mockReturnValue({
    previewingId: null,
    previewLoadingId: null,
    previewProgress: 0,
    isPreviewUnavailable: () => false,
    togglePreview: jest.fn(),
  });
  mockUsePlayback.mockReturnValue({
    currentTrack: null,
    isPlaying: false,
    playTracks,
    togglePlay,
  });
});

function localDetail(): UnifiedAlbumDetail {
  const mk = (n: number) => ({
    id: `lt-${n}`,
    title: `Track ${n}`,
    trackNumber: n,
    discNumber: null,
    durationSeconds: 100 + n,
    recordingMbid: `rec-${n}`,
    artists: [],
  });
  return {
    source: "local",
    album: {
      id: "al-1",
      title: "Rumours",
      artistId: "ar-1",
      artistName: "Fleetwood Mac",
      releaseYear: 1977,
      releaseMbid: "rel-1",
      releaseGroupMbid: "rg-1",
      coverArtUrl: null,
      confidenceScore: 1,
      pendingTrackCount: 0,
      artists: [],
    },
    tracks: [mk(1), mk(2), mk(3)],
  } as UnifiedAlbumDetail;
}

function externalDetail(): UnifiedAlbumDetail {
  return {
    source: "external",
    album: {
      releaseGroupMbid: "rg-9",
      releaseMbid: "rel-9",
      title: "Tusk",
      artistName: "Fleetwood Mac",
      artistMbid: "amb-1",
      releaseYear: 1979,
      releaseType: "Album",
      artists: [],
      coverArtUrl: null,
    },
    tracks: [
      {
        discPosition: 1,
        trackPosition: 1,
        recordingMbid: "xrec-1",
        title: "Over & Over",
        durationMs: 274000,
      },
    ],
  } as UnifiedAlbumDetail;
}

function renderDetail(
  detail: UnifiedAlbumDetail,
  onRequest = jest.fn(),
): { onRequest: jest.Mock } {
  render(
    <StaccatoThemeProvider>
      <AlbumDetail
        detail={detail}
        albumKey="al-1"
        onBack={jest.fn()}
        onOpenAlbum={jest.fn()}
        onRequest={onRequest}
      />
    </StaccatoThemeProvider>,
  );
  return { onRequest };
}

describe("AlbumDetail", () => {
  it("plays the whole album from the hero play button", () => {
    renderDetail(localDetail());
    // The hero FAB is the first "Play" affordance; track-row arts follow.
    fireEvent.press(screen.getAllByLabelText("Play")[0]!);
    expect(playTracks).toHaveBeenCalledWith(["lt-1", "lt-2", "lt-3"], 0, {
      type: "album",
      id: "al-1",
    });
  });

  it("queues the whole album starting at the tapped track", () => {
    renderDetail(localDetail());
    // [0] = hero FAB, [1..] = track rows in order.
    fireEvent.press(screen.getAllByLabelText("Play")[2]!);
    expect(playTracks).toHaveBeenCalledWith(["lt-1", "lt-2", "lt-3"], 1, {
      type: "album",
      id: "al-1",
    });
  });

  it("requests an external album via Lidarr from the hero action zone", () => {
    const { onRequest } = renderDetail(externalDetail());
    fireEvent.press(screen.getByLabelText("Request via Lidarr"));
    expect(onRequest).toHaveBeenCalledTimes(1);
    // External albums aren't owned, so nothing is queued for playback.
    expect(playTracks).not.toHaveBeenCalled();
  });
});
