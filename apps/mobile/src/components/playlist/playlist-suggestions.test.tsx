import type { RecommendedPlaylistTrack } from "@staccato/shared";
import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";

import { StaccatoThemeProvider } from "@/theme";
import { PlaylistSuggestions } from "./playlist-suggestions";

const mockUseSuggestions = jest.fn();
jest.mock("@/hooks/use-playlist-suggestions", () => ({
  usePlaylistSuggestions: () => mockUseSuggestions(),
}));

jest.mock("@/providers/preview-provider", () => ({
  usePreview: () => ({
    previewingId: null,
    previewLoadingId: null,
    previewProgress: 0,
    isPreviewUnavailable: () => false,
    togglePreview: jest.fn(),
  }),
}));

jest.mock("@/providers/playback-provider", () => ({
  usePlayback: () => ({
    currentTrack: null,
    isPlaying: false,
    playTracks: jest.fn(),
    togglePlay: jest.fn(),
  }),
}));

jest.mock("@/lib/session", () => ({
  useSession: () => ({ session: { serverUrl: "https://m", token: "t" } }),
}));

function track(n: number): RecommendedPlaylistTrack {
  return {
    recordingMbid: `rec-${n}`,
    title: `Suggestion ${n}`,
    artistName: "Artist",
    artistMbid: `amb-${n}`,
    albumTitle: "Album",
    releaseGroupMbid: `rg-${n}`,
    durationMs: 200000,
    coverArtUrl: null,
    inLibrary: false,
    localTrackId: null,
  };
}

function renderBlock(onRequestDownload = jest.fn()) {
  render(
    <StaccatoThemeProvider>
      <PlaylistSuggestions
        playlistId="pl-1"
        onRequestDownload={onRequestDownload}
      />
    </StaccatoThemeProvider>,
  );
  return { onRequestDownload };
}

beforeEach(() => jest.clearAllMocks());

it("renders nothing when there are no suggestions", () => {
  mockUseSuggestions.mockReturnValue({ data: { status: "warming" } });
  renderBlock();
  expect(screen.queryByText("SUGGESTED TRACKS")).toBeNull();
});

it("shows three suggestions and a refresh pill when the pool is larger", () => {
  mockUseSuggestions.mockReturnValue({
    data: { status: "ready", data: [1, 2, 3, 4].map(track) },
  });
  renderBlock();
  expect(screen.getByText("Suggestion 1")).toBeTruthy();
  expect(screen.getByText("Suggestion 3")).toBeTruthy();
  expect(screen.queryByText("Suggestion 4")).toBeNull();
  expect(screen.getByLabelText("Refresh suggestions")).toBeTruthy();
});

it("requests a suggestion via Lidarr and rotates in the next one", () => {
  mockUseSuggestions.mockReturnValue({
    data: { status: "ready", data: [1, 2, 3, 4].map(track) },
  });
  const { onRequestDownload } = renderBlock();
  fireEvent.press(screen.getByLabelText("Add Suggestion 1"));
  expect(onRequestDownload).toHaveBeenCalledWith(
    expect.objectContaining({
      releaseGroupMbid: "rg-1",
      title: "Suggestion 1",
    }),
  );
  // The dismissed slot is backfilled by the 4th pool candidate.
  expect(screen.getByText("Suggestion 4")).toBeTruthy();
  expect(screen.queryByText("Suggestion 1")).toBeNull();
});

it("dismisses a suggestion and swaps in the next candidate", () => {
  mockUseSuggestions.mockReturnValue({
    data: { status: "ready", data: [1, 2, 3, 4].map(track) },
  });
  renderBlock();
  fireEvent.press(screen.getByLabelText("Dismiss Suggestion 2"));
  expect(screen.queryByText("Suggestion 2")).toBeNull();
  expect(screen.getByText("Suggestion 4")).toBeTruthy();
});
