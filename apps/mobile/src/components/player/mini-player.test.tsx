import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";
import type { PlaybackTrack } from "@staccato/shared";

import { StaccatoThemeProvider } from "@/theme";
import { MiniPlayer } from "./mini-player";

const mockUsePlayback = jest.fn();
jest.mock("@/providers/playback-provider", () => ({
  usePlayback: () => mockUsePlayback(),
}));

jest.mock("@/lib/session", () => ({
  useSession: () => ({
    session: { serverUrl: "https://music.home.arpa", token: "tok" },
  }),
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
    currentTrack: TRACK,
    isPlaying: false,
    position: 63.5,
    duration: 254,
    setPlayerOpen: jest.fn(),
    togglePlay: jest.fn(),
    next: jest.fn(),
    ...overrides,
  };
}

function renderMiniPlayer(value = playbackValue()) {
  mockUsePlayback.mockReturnValue(value);
  render(
    <StaccatoThemeProvider>
      <MiniPlayer />
    </StaccatoThemeProvider>,
  );
  return value;
}

beforeEach(() => jest.clearAllMocks());

describe("MiniPlayer", () => {
  it("renders nothing when there is no current track", () => {
    renderMiniPlayer(playbackValue({ currentTrack: null }));
    expect(screen.queryByTestId("mini-player")).toBeNull();
  });

  it("shows the track title and artist", () => {
    renderMiniPlayer();
    expect(screen.getByText("Dreams")).toBeTruthy();
    expect(screen.getByText("Fleetwood Mac")).toBeTruthy();
  });

  it("shows the play glyph when paused and the pause glyph when playing", () => {
    renderMiniPlayer(playbackValue({ isPlaying: false }));
    expect(screen.getByTestId("mini-player-play-icon")).toBeTruthy();

    renderMiniPlayer(playbackValue({ isPlaying: true }));
    expect(screen.getByTestId("mini-player-pause-icon")).toBeTruthy();
  });

  it("opens the full player when the card is tapped", () => {
    const value = renderMiniPlayer();
    fireEvent.press(screen.getByTestId("mini-player"));
    expect(value.setPlayerOpen).toHaveBeenCalledWith(true);
  });

  it("play/pause toggles playback without opening the player", () => {
    const value = renderMiniPlayer();
    fireEvent.press(screen.getByTestId("mini-player-play-pause"));
    expect(value.togglePlay).toHaveBeenCalled();
    expect(value.setPlayerOpen).not.toHaveBeenCalled();
  });

  it("skip-next advances without opening the player", () => {
    const value = renderMiniPlayer();
    fireEvent.press(screen.getByTestId("mini-player-next"));
    expect(value.next).toHaveBeenCalled();
    expect(value.setPlayerOpen).not.toHaveBeenCalled();
  });

  it("sizes the progress fill from position/duration", () => {
    renderMiniPlayer(playbackValue({ position: 63.5, duration: 254 }));
    expect(screen.getByTestId("mini-player-progress-fill")).toHaveStyle({
      width: "25%",
    });
  });

  it("shows an empty progress line when duration is unknown", () => {
    renderMiniPlayer(playbackValue({ position: 10, duration: 0 }));
    expect(screen.getByTestId("mini-player-progress-fill")).toHaveStyle({
      width: "0%",
    });
  });
});
