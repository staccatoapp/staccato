import { render, screen } from "@testing-library/react-native";
import React from "react";
import type { PlaybackTrack } from "@staccato/shared";

import { StaccatoThemeProvider } from "@/theme";
import { PlayerOverlayRoot } from "./player-overlay";

const mockUseSession = jest.fn();
jest.mock("@/lib/session", () => ({
  useSession: () => mockUseSession(),
}));

const mockUsePlayback = jest.fn();
jest.mock("@/providers/playback-provider", () => ({
  PlaybackProvider: ({ children }: { children: React.ReactNode }) => children,
  usePlayback: () => mockUsePlayback(),
}));

jest.mock("@/hooks/use-lyrics", () => ({
  useLyrics: () => ({ data: null }),
}));

// The now-playing panel mounts the add-to-playlist sheet, which uses
// react-query data hooks; stub them so the overlay renders without a client.
jest.mock("@/hooks/use-library-playlists", () => ({
  useLibraryPlaylists: () => ({
    items: [],
    fetchNextPage: jest.fn(),
    hasNextPage: false,
    isLoading: false,
  }),
}));
jest.mock("@/hooks/use-add-track-to-playlist", () => ({
  useAddTrackToPlaylist: () => ({ mutate: jest.fn(), isPending: false }),
}));

const TRACK: PlaybackTrack = {
  id: "t1",
  title: "Dreams",
  trackNumber: 2,
  discNumber: 1,
  artistName: "Fleetwood Mac",
  albumTitle: "Rumours",
  coverArtUrl: null,
  durationSeconds: 254,
  artists: [],
};

function playbackValue(overrides: Record<string, unknown> = {}) {
  return {
    session: undefined,
    currentTrack: TRACK,
    isPlaying: false,
    position: 0,
    duration: 254,
    isPlayerOpen: false,
    setPlayerOpen: jest.fn(),
    togglePlay: jest.fn(),
    next: jest.fn(),
    prev: jest.fn(),
    seekTo: jest.fn(),
    jumpToIndex: jest.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUsePlayback.mockReturnValue(playbackValue());
});

function renderOverlay() {
  render(
    <StaccatoThemeProvider>
      <PlayerOverlayRoot />
    </StaccatoThemeProvider>,
  );
}

describe("PlayerOverlayRoot", () => {
  it("renders nothing while the auth session is loading", () => {
    mockUseSession.mockReturnValue({ session: null, isLoading: true });
    renderOverlay();
    expect(screen.queryByTestId("player-overlay")).toBeNull();
  });

  it("renders nothing when signed out", () => {
    mockUseSession.mockReturnValue({ session: null, isLoading: false });
    renderOverlay();
    expect(screen.queryByTestId("player-overlay")).toBeNull();
  });

  it("renders the mini player and the now-playing panel when signed in", () => {
    mockUseSession.mockReturnValue({
      session: { serverUrl: "https://music.home.arpa", token: "tok" },
      isLoading: false,
    });
    renderOverlay();
    expect(screen.getByTestId("player-overlay")).toBeTruthy();
    expect(screen.getByTestId("mini-player")).toBeTruthy();
    expect(screen.getByTestId("now-playing-panel")).toBeTruthy();
  });
});
