import type { PlaylistDetail, RecommendedPlaylist } from "@staccato/shared";
import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";

import {
  playlistViewFromLibrary,
  playlistViewFromRecommended,
} from "@/lib/playlist-view-model";
import { StaccatoThemeProvider } from "@/theme";
import { PlaylistDetail as PlaylistDetailView } from "./playlist-detail";

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

// In-library mode renders the suggestions block; keep it empty here.
jest.mock("@/hooks/use-playlist-suggestions", () => ({
  usePlaylistSuggestions: () => ({ data: undefined }),
}));

let playTracks: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  playTracks = jest.fn();
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
    togglePlay: jest.fn(),
  });
});

function libraryDetail(): PlaylistDetail {
  const mk = (n: number) => ({
    entryId: `e${n}`,
    trackId: `t${n}`,
    recordingMbid: `mb-${n}`,
    title: `Track ${n}`,
    artistName: "Artist",
    albumTitle: "Album",
    albumId: `al-${n}`,
    coverArtUrl: null,
    durationSeconds: 100 + n,
    trackNumber: n,
    position: n - 1,
  });
  return {
    id: "pl-lib",
    name: "Morning Chill",
    description: null,
    updatedAt: null,
    coverArtUrls: [],
    tracks: [mk(1), mk(2), mk(3)],
  };
}

function recommendedPlaylist(): RecommendedPlaylist {
  return {
    id: "pl-rec",
    name: "Canyon Gold",
    description: "Laurel Canyon",
    trackCount: 2,
    coverArtUrl: null,
    expiresAt: null,
    source: "listenbrainz",
    tracks: [
      {
        recordingMbid: "rec-1",
        title: "Dreams",
        artistName: "Fleetwood Mac",
        artistMbid: "amb-1",
        albumTitle: "Rumours",
        releaseGroupMbid: "rg-1",
        durationMs: 254000,
        coverArtUrl: null,
        inLibrary: true,
        localTrackId: "lt-1",
      },
      {
        recordingMbid: "rec-2",
        title: "Heart of Gold",
        artistName: "Neil Young",
        artistMbid: "amb-2",
        albumTitle: "Harvest",
        releaseGroupMbid: "rg-2",
        durationMs: 188000,
        coverArtUrl: null,
        inLibrary: false,
        localTrackId: null,
      },
    ],
  };
}

function renderDetail(
  view: ReturnType<typeof playlistViewFromLibrary>,
  handlers: { onRequestTrack?: jest.Mock; onAddAll?: jest.Mock } = {},
) {
  const onRequestTrack = handlers.onRequestTrack ?? jest.fn();
  const onAddAll = handlers.onAddAll ?? jest.fn();
  render(
    <StaccatoThemeProvider>
      <PlaylistDetailView
        view={view}
        onBack={jest.fn()}
        onRequestTrack={onRequestTrack}
        onAddAll={onAddAll}
      />
    </StaccatoThemeProvider>,
  );
  return { onRequestTrack, onAddAll };
}

describe("PlaylistDetail — in-library", () => {
  it("plays the whole playlist from the hero play button", () => {
    renderDetail(playlistViewFromLibrary(libraryDetail()));
    fireEvent.press(screen.getAllByLabelText("Play")[0]!);
    expect(playTracks).toHaveBeenCalledWith(["t1", "t2", "t3"], 0, {
      type: "playlist",
      id: "pl-lib",
    });
  });

  it("queues the whole playlist starting at the tapped track", () => {
    renderDetail(playlistViewFromLibrary(libraryDetail()));
    // [0] = hero FAB, [1..] = track rows in order.
    fireEvent.press(screen.getAllByLabelText("Play")[2]!);
    expect(playTracks).toHaveBeenCalledWith(["t1", "t2", "t3"], 1, {
      type: "playlist",
      id: "pl-lib",
    });
  });
});

describe("PlaylistDetail — recommended", () => {
  it("offers Add all to library instead of play, and triggers onAddAll", () => {
    const { onAddAll } = renderDetail(
      playlistViewFromRecommended(recommendedPlaylist()),
    );
    fireEvent.press(screen.getByLabelText("Add all to library"));
    expect(onAddAll).toHaveBeenCalledTimes(1);
  });

  it("requests a not-in-library track via Lidarr from its row", () => {
    const { onRequestTrack } = renderDetail(
      playlistViewFromRecommended(recommendedPlaylist()),
    );
    fireEvent.press(screen.getByLabelText("Request Heart of Gold via Lidarr"));
    expect(onRequestTrack).toHaveBeenCalledWith(
      expect.objectContaining({
        releaseGroupMbid: "rg-2",
        artistMbid: "amb-2",
        title: "Heart of Gold",
      }),
    );
  });
});
