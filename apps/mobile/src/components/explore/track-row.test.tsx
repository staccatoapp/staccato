import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";

import { StaccatoThemeProvider } from "@/theme";
import { TrackRow, type TrackRowTrack } from "./track-row";

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

function makeTrack(over: Partial<TrackRowTrack> = {}): TrackRowTrack {
  return {
    recordingMbid: "rec-1",
    title: "Dreams",
    subtitle: "Fleetwood Mac",
    coverArtUrl: null,
    inLibrary: false,
    localTrackId: null,
    resolvePreviewUrl: jest.fn().mockResolvedValue("https://preview/clip.mp3"),
    previewable: true,
    ...over,
  };
}

let togglePreview: jest.Mock;
let playTracks: jest.Mock;
let togglePlay: jest.Mock;

function setProviders(
  preview: Partial<{
    previewingId: string | null;
    previewLoadingId: string | null;
    previewProgress: number;
  }> = {},
  playback: Partial<{
    currentTrack: { id: string } | null;
    isPlaying: boolean;
  }> = {},
) {
  mockUsePreview.mockReturnValue({
    previewingId: preview.previewingId ?? null,
    previewLoadingId: preview.previewLoadingId ?? null,
    previewProgress: preview.previewProgress ?? 0,
    togglePreview,
  });
  mockUsePlayback.mockReturnValue({
    currentTrack: playback.currentTrack ?? null,
    isPlaying: playback.isPlaying ?? false,
    playTracks,
    togglePlay,
  });
}

function renderRow(track: TrackRowTrack) {
  render(
    <StaccatoThemeProvider>
      <TrackRow track={track} />
    </StaccatoThemeProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  togglePreview = jest.fn();
  playTracks = jest.fn();
  togglePlay = jest.fn();
  setProviders();
});

describe("TrackRow", () => {
  it("plays an owned track in full on tap", () => {
    setProviders();
    renderRow(makeTrack({ inLibrary: true, localTrackId: "lt-1" }));
    fireEvent.press(screen.getByLabelText("Play"));
    expect(playTracks).toHaveBeenCalledWith(["lt-1"], 0);
    expect(togglePreview).not.toHaveBeenCalled();
  });

  it("toggles pause when the owned track is already the current track", () => {
    setProviders({}, { currentTrack: { id: "lt-1" }, isPlaying: true });
    renderRow(makeTrack({ inLibrary: true, localTrackId: "lt-1" }));
    fireEvent.press(screen.getByLabelText("Stop"));
    expect(togglePlay).toHaveBeenCalledTimes(1);
    expect(playTracks).not.toHaveBeenCalled();
  });

  it("previews an external track on tap, passing the lazy resolver", () => {
    const track = makeTrack({ inLibrary: false, previewable: true });
    renderRow(track);
    fireEvent.press(screen.getByLabelText("Play"));
    expect(togglePreview).toHaveBeenCalledWith(
      "rec-1",
      track.resolvePreviewUrl,
    );
  });

  it("renders no play affordance for a non-previewable, non-library track", () => {
    renderRow(makeTrack({ inLibrary: false, previewable: false }));
    expect(screen.queryByLabelText("Play")).toBeNull();
    expect(screen.queryByLabelText("Stop")).toBeNull();
  });

  it("shows the stop affordance while previewing", () => {
    setProviders({ previewingId: "rec-1" });
    renderRow(makeTrack({ inLibrary: false }));
    expect(screen.getByLabelText("Stop")).toBeTruthy();
  });
});
