import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";
import type { RecommendedTrack } from "@staccato/shared";

import { StaccatoThemeProvider } from "@/theme";
import { RecTrackRow } from "./rec-track-row";

const mockUsePreview = jest.fn();
jest.mock("@/providers/preview-provider", () => ({
  usePreview: () => mockUsePreview(),
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
    ...overrides,
  };
}

function renderRow(
  track: RecommendedTrack,
  preview: Partial<{
    previewingId: string | null;
    previewProgress: number;
    togglePreview: jest.Mock;
  }> = {},
) {
  const togglePreview = preview.togglePreview ?? jest.fn();
  mockUsePreview.mockReturnValue({
    previewingId: preview.previewingId ?? null,
    previewProgress: preview.previewProgress ?? 0,
    togglePreview,
  });
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
  return { togglePreview, onRequestDownload };
}

beforeEach(() => jest.clearAllMocks());

describe("RecTrackRow", () => {
  it("shows the duration and no request button for an in-library track", () => {
    renderRow(makeTrack({ inLibrary: true }));
    expect(screen.getByText("4:14")).toBeTruthy();
    expect(screen.queryByLabelText("Request Dreams via Lidarr")).toBeNull();
  });

  it("shows the Lidarr request button for a requestable non-library track", () => {
    const { onRequestDownload } = renderRow(makeTrack({ inLibrary: false }));
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
    renderRow(makeTrack({ inLibrary: false, releaseGroupMbid: null }));
    expect(screen.queryByLabelText("Request Dreams via Lidarr")).toBeNull();
  });

  it("toggles a preview when the artwork is pressed", () => {
    const { togglePreview } = renderRow(makeTrack());
    fireEvent.press(screen.getByLabelText("Play preview"));
    expect(togglePreview).toHaveBeenCalledWith(
      "rec-1",
      "https://preview.example/clip.mp3",
    );
  });

  it("shows the stop affordance while previewing", () => {
    renderRow(makeTrack(), { previewingId: "rec-1" });
    expect(screen.getByLabelText("Stop preview")).toBeTruthy();
  });
});
