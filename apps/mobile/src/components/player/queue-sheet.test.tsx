import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";
import type { PlaybackSession, PlaybackTrack } from "@staccato/shared";

import { StaccatoThemeProvider } from "@/theme";
import { QueueSheet } from "./queue-sheet";

const mockUsePlayback = jest.fn();
jest.mock("@/providers/playback-provider", () => ({
  usePlayback: () => mockUsePlayback(),
}));

jest.mock("@/lib/session", () => ({
  useSession: () => ({
    session: { serverUrl: "https://music.home.arpa", token: "tok" },
  }),
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
  trackQueue: [
    track("t1", "Second Hand News"),
    track("t2", "Dreams"),
    track("t3", "Never Going Back Again"),
    track("t4", "Songbird"),
  ],
  currentTrackIndex: 1,
  currentTrackPositionInSeconds: 0,
  currentTrackAccumulatedPlayTimeInSeconds: 0,
  currentTrackListenEventCreated: false,
  isPlaying: true,
};

function renderSheet(overrides: Record<string, unknown> = {}) {
  const value = {
    session: SESSION,
    currentTrack: SESSION.trackQueue[1],
    isPlaying: true,
    jumpToIndex: jest.fn(),
    ...overrides,
  };
  mockUsePlayback.mockReturnValue(value);
  const onClose = jest.fn();
  render(
    <StaccatoThemeProvider>
      <QueueSheet open onClose={onClose} />
    </StaccatoThemeProvider>,
  );
  return { value, onClose };
}

beforeEach(() => jest.clearAllMocks());

describe("QueueSheet", () => {
  it("shows the header and the now-playing card", () => {
    renderSheet();
    expect(screen.getByText("Up next")).toBeTruthy();
    expect(screen.getByText("NOW PLAYING")).toBeTruthy();
    expect(screen.getByText("Dreams")).toBeTruthy();
    expect(screen.getByTestId("equalizer-bars")).toBeTruthy();
  });

  it("lists only the tracks after the current one", () => {
    renderSheet();
    expect(screen.getByText("Never Going Back Again")).toBeTruthy();
    expect(screen.getByText("Songbird")).toBeTruthy();
    expect(screen.queryByText("Second Hand News")).toBeNull();
  });

  it("labels the list with the current album", () => {
    renderSheet();
    expect(screen.getByText("FROM RUMOURS")).toBeTruthy();
  });

  it("jumps to a tapped queue track by absolute index", () => {
    const { value } = renderSheet();
    fireEvent.press(screen.getByText("Songbird"));
    expect(value.jumpToIndex).toHaveBeenCalledWith(3);
  });

  it("closes from the backdrop", () => {
    const { onClose } = renderSheet();
    fireEvent.press(screen.getByTestId("queue-sheet-backdrop"));
    expect(onClose).toHaveBeenCalled();
  });
});
