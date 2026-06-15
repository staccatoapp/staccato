import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";
import type { RecommendedTrack } from "@staccato/shared";

import { StaccatoThemeProvider } from "@/theme";
import { RecTrackRow } from "./rec-track-row";

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

function makeTrack(
  overrides: Partial<RecommendedTrack> = {},
): RecommendedTrack {
  return {
    recordingMbid: "rec-1",
    title: "Dreams",
    artistName: "Fleetwood Mac",
    artistMbid: "artist-1",
    albumTitle: "Rumours",
    releaseGroupMbid: "rg-1",
    coverArtUrl: null,
    previewUrl: "https://preview.example/clip.mp3",
    durationMs: 254000,
    inLibrary: true,
    localTrackId: "lt-1",
    ...overrides,
  };
}

function renderRow(track: RecommendedTrack) {
  const onRequestDownload = jest.fn();
  render(
    <StaccatoThemeProvider>
      <RecTrackRow
        track={track}
        index={1}
        onRequestDownload={onRequestDownload}
      />
    </StaccatoThemeProvider>,
  );
  return { onRequestDownload };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUsePreview.mockReturnValue({
    previewingId: null,
    previewLoadingId: null,
    previewProgress: 0,
    togglePreview: jest.fn(),
  });
  mockUsePlayback.mockReturnValue({
    currentTrack: null,
    isPlaying: false,
    playTracks: jest.fn(),
    togglePlay: jest.fn(),
  });
});

describe("RecTrackRow", () => {
  it("shows the duration and no request button for an in-library track", () => {
    renderRow(makeTrack({ inLibrary: true }));
    expect(screen.getByText("4:14")).toBeTruthy();
    expect(screen.queryByLabelText("Request Dreams via Lidarr")).toBeNull();
  });

  it("shows the Lidarr request button for a requestable non-library track", () => {
    const { onRequestDownload } = renderRow(
      makeTrack({ inLibrary: false, localTrackId: null }),
    );
    expect(screen.getByText("Fleetwood Mac · Not in library")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Request Dreams via Lidarr"));
    expect(onRequestDownload).toHaveBeenCalledWith(
      expect.objectContaining({
        releaseGroupMbid: "rg-1",
        artistMbid: "artist-1",
        artistName: "Fleetwood Mac",
        albumTitle: "Rumours",
        title: "Dreams",
      }),
    );
  });

  it("hides the request button when the track can't be requested", () => {
    renderRow(
      makeTrack({
        inLibrary: false,
        localTrackId: null,
        releaseGroupMbid: null,
      }),
    );
    expect(screen.queryByLabelText("Request Dreams via Lidarr")).toBeNull();
  });
});
