import {
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react-native";
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
    artistName: "Fleetwood Mac",
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
    isPreviewUnavailable: (id: string) => boolean;
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
    isPreviewUnavailable: preview.isPreviewUnavailable ?? (() => false),
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

  it("queues the whole album when album queue context is provided", () => {
    setProviders();
    render(
      <StaccatoThemeProvider>
        <TrackRow
          track={makeTrack({ inLibrary: true, localTrackId: "lt-2" })}
          queueTrackIds={["lt-1", "lt-2", "lt-3"]}
          queueIndex={1}
        />
      </StaccatoThemeProvider>,
    );
    fireEvent.press(screen.getByLabelText("Play"));
    // No source prop here, so none is forwarded.
    expect(playTracks).toHaveBeenCalledWith(
      ["lt-1", "lt-2", "lt-3"],
      1,
      undefined,
    );
  });

  it("toggles pause when the owned track is already the current track", () => {
    setProviders({}, { currentTrack: { id: "lt-1" }, isPlaying: true });
    renderRow(makeTrack({ inLibrary: true, localTrackId: "lt-1" }));
    fireEvent.press(screen.getByLabelText("Stop"));
    expect(togglePlay).toHaveBeenCalledTimes(1);
    expect(playTracks).not.toHaveBeenCalled();
  });

  it("previews an external track on tap via the server proxy", () => {
    renderRow(makeTrack({ inLibrary: false }));
    fireEvent.press(screen.getByLabelText("Play"));
    expect(togglePreview).toHaveBeenCalledWith(
      "rec-1",
      "Fleetwood Mac",
      "Dreams",
    );
  });

  it("shows a disabled preview-off glyph for an unavailable external track", () => {
    setProviders({ isPreviewUnavailable: (id) => id === "rec-1" });
    renderRow(makeTrack({ inLibrary: false }));
    expect(screen.getByLabelText("Preview unavailable")).toBeTruthy();
    expect(screen.queryByLabelText("Play")).toBeNull();
  });

  it("shows the stop affordance while previewing", () => {
    setProviders({ previewingId: "rec-1" });
    renderRow(makeTrack({ inLibrary: false }));
    expect(screen.getByLabelText("Stop")).toBeTruthy();
  });

  it("makes the whole row the tap target — the title sits inside the play control", () => {
    renderRow(makeTrack({ inLibrary: true, localTrackId: "lt-1" }));
    const control = screen.getByLabelText("Play");
    expect(within(control).getByText("Dreams")).toBeTruthy();
  });

  describe("equalizer indicator", () => {
    it("shows for the current owned track", () => {
      setProviders({}, { currentTrack: { id: "lt-1" }, isPlaying: true });
      renderRow(makeTrack({ inLibrary: true, localTrackId: "lt-1" }));
      expect(screen.getByTestId("equalizer-bars")).toBeTruthy();
    });

    it("still shows (frozen) for the current owned track while paused", () => {
      setProviders({}, { currentTrack: { id: "lt-1" }, isPlaying: false });
      renderRow(makeTrack({ inLibrary: true, localTrackId: "lt-1" }));
      expect(screen.getByTestId("equalizer-bars")).toBeTruthy();
    });

    it("shows while previewing an external track", () => {
      setProviders({ previewingId: "rec-1" });
      renderRow(makeTrack({ inLibrary: false }));
      expect(screen.getByTestId("equalizer-bars")).toBeTruthy();
    });

    it("is absent for an idle row", () => {
      renderRow(makeTrack({ inLibrary: true, localTrackId: "lt-1" }));
      expect(screen.queryByTestId("equalizer-bars")).toBeNull();
    });
  });

  describe("album context", () => {
    function renderAlbumRow(track: TrackRowTrack) {
      render(
        <StaccatoThemeProvider>
          <TrackRow track={track} album index={3} />
        </StaccatoThemeProvider>,
      );
    }

    it("hides the artwork and keeps the index", () => {
      renderAlbumRow(makeTrack({ inLibrary: true, localTrackId: "lt-1" }));
      expect(screen.queryByTestId("track-art")).toBeNull();
      expect(screen.getByText("3")).toBeTruthy();
    });

    it("renders a non-functional more-options button", () => {
      renderAlbumRow(makeTrack({ inLibrary: true, localTrackId: "lt-1" }));
      expect(screen.getByLabelText("More options")).toBeTruthy();
    });

    it("still plays the owned track on a row tap", () => {
      renderAlbumRow(makeTrack({ inLibrary: true, localTrackId: "lt-1" }));
      fireEvent.press(screen.getByLabelText("Play"));
      expect(playTracks).toHaveBeenCalledWith(["lt-1"], 0);
    });
  });

  it("shows artwork and no more-options button outside album context", () => {
    renderRow(makeTrack({ inLibrary: true, localTrackId: "lt-1" }));
    expect(screen.getByTestId("track-art")).toBeTruthy();
    expect(screen.queryByLabelText("More options")).toBeNull();
  });
});
