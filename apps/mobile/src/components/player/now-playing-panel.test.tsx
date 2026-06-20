import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";
import type {
  PlaybackSession,
  PlaybackTrack,
  TrackLyrics,
} from "@staccato/shared";

import { StaccatoThemeProvider } from "@/theme";
import { NowPlayingPanel } from "./now-playing-panel";

const mockUsePlayback = jest.fn();
jest.mock("@/providers/playback-provider", () => ({
  usePlayback: () => mockUsePlayback(),
}));

const mockUseLyrics = jest.fn();
jest.mock("@/hooks/use-lyrics", () => ({
  useLyrics: (trackId: string | undefined) => mockUseLyrics(trackId),
}));

jest.mock("@/lib/session", () => ({
  useSession: () => ({
    session: { serverUrl: "https://music.home.arpa", token: "tok" },
  }),
}));

// The add-to-playlist sheet (mounted by the panel) talks to react-query; stub
// its data hooks so the panel renders without a QueryClient under test.
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

function track(id: string, title: string): PlaybackTrack {
  return {
    id,
    title,
    trackNumber: 1,
    discNumber: 1,
    artistName: "Fleetwood Mac",
    albumTitle: "Rumours",
    coverArtUrl: null,
    durationSeconds: 254,
    artists: [],
  };
}

const SESSION: PlaybackSession = {
  trackQueue: [track("t1", "Dreams"), track("t2", "Songbird")],
  currentTrackIndex: 0,
  currentTrackPositionInSeconds: 60,
  currentTrackAccumulatedPlayTimeInSeconds: 0,
  currentTrackListenEventCreated: false,
  isPlaying: true,
};

const LYRICS: TrackLyrics = {
  trackId: "t1",
  instrumental: false,
  plainLyrics: null,
  syncedLyrics: [
    { startingTime: 0, lyrics: "Now here you go again" },
    { startingTime: 5, lyrics: "You say you want your freedom" },
  ],
};

function playbackValue(overrides: Record<string, unknown> = {}) {
  return {
    session: SESSION,
    currentTrack: SESSION.trackQueue[0],
    isPlaying: true,
    position: 60,
    duration: 254,
    isPlayerOpen: true,
    setPlayerOpen: jest.fn(),
    togglePlay: jest.fn(),
    next: jest.fn(),
    prev: jest.fn(),
    seekTo: jest.fn(),
    jumpToIndex: jest.fn(),
    ...overrides,
  };
}

function renderPanel(
  value = playbackValue(),
  lyrics: TrackLyrics | null = LYRICS,
) {
  mockUsePlayback.mockReturnValue(value);
  mockUseLyrics.mockReturnValue({ data: lyrics });
  render(
    <StaccatoThemeProvider>
      <NowPlayingPanel />
    </StaccatoThemeProvider>,
  );
  return value;
}

beforeEach(() => jest.clearAllMocks());

describe("NowPlayingPanel", () => {
  it("renders nothing without a current track", () => {
    renderPanel(playbackValue({ currentTrack: null }));
    expect(screen.queryByTestId("now-playing-panel")).toBeNull();
  });

  it("shows the album context in the top bar", () => {
    renderPanel();
    expect(screen.getByText("PLAYING FROM ALBUM")).toBeTruthy();
    expect(screen.getByText("Rumours")).toBeTruthy();
  });

  it("shows the track meta and album art by default", () => {
    renderPanel();
    // The track title/artist also appear inside the (closed) queue sheet.
    expect(screen.getAllByText("Dreams").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Fleetwood Mac").length).toBeGreaterThan(0);
    expect(screen.getByTestId("now-playing-art")).toBeTruthy();
    expect(screen.queryByTestId("lyrics-view")).toBeNull();
  });

  it("collapses from the chevron", () => {
    const value = renderPanel();
    fireEvent.press(screen.getByTestId("now-playing-close"));
    expect(value.setPlayerOpen).toHaveBeenCalledWith(false);
  });

  it("swaps the centre stage to lyrics and back from the Lyrics pill", () => {
    renderPanel();
    fireEvent.press(screen.getByTestId("pill-lyrics"));
    expect(screen.getByTestId("lyrics-view")).toBeTruthy();
    expect(screen.queryByTestId("now-playing-art")).toBeNull();

    fireEvent.press(screen.getByTestId("pill-lyrics"));
    expect(screen.queryByTestId("lyrics-view")).toBeNull();
    expect(screen.getByTestId("now-playing-art")).toBeTruthy();
  });

  it("disables the lyrics pill when the track has no synced lyrics", () => {
    renderPanel(playbackValue(), null);
    expect(screen.getByTestId("pill-lyrics")).toBeDisabled();
  });

  it("opens the queue sheet from the Up Next pill", () => {
    renderPanel();
    fireEvent.press(screen.getByTestId("pill-up-next"));
    expect(screen.getByText("Up next")).toBeTruthy();
  });

  it("opens the add-to-playlist sheet from the + button", () => {
    renderPanel();
    fireEvent.press(screen.getByLabelText("Add to playlist"));
    expect(screen.getByText("You don't have any playlists yet.")).toBeTruthy();
  });
});
