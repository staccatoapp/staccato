import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";
import type { ExternalSearchResults } from "@staccato/shared";

import { StaccatoThemeProvider } from "@/theme";
import { SearchResultsView } from "./search-results-view";

jest.mock("@/lib/session", () => ({
  useSession: () => ({
    session: { serverUrl: "https://music.home.arpa", token: "tok" },
  }),
}));

jest.mock("@/providers/preview-provider", () => ({
  usePreview: () => ({
    previewingId: null,
    previewLoadingId: null,
    previewProgress: 0,
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

const RESULTS: ExternalSearchResults = {
  recordings: [
    {
      recordingMbid: "rec-1",
      title: "Dreams",
      artistName: "Fleetwood Mac",
      artistMbid: "artist-1",
      releaseName: "Rumours",
      releaseMbid: "rel-rec-1",
      releaseYear: 1977,
      durationMs: 254000,
      inLibrary: false,
      localTrackId: null,
      coverArtUrl: null,
      listenCount: 100,
    },
  ],
  releases: [
    {
      releaseMbid: "rel-1",
      releaseGroupMbid: "rg-1",
      title: "Rumours",
      artistName: "Fleetwood Mac",
      artistMbid: "artist-1",
      releaseYear: 1977,
      releaseType: "Album",
      coverArtUrl: null,
      listenCount: 200,
    },
  ],
  artists: [
    {
      artistMbid: "artist-1",
      name: "Fleetwood Mac",
      disambiguation: "British-American rock band",
      type: "Group",
      listenCount: 300,
      imageUrl: null,
    },
  ],
  topResult: { type: "recording", mbid: "rec-1" },
};

function renderResults(results: ExternalSearchResults = RESULTS) {
  const onRequestDownload = jest.fn();
  render(
    <StaccatoThemeProvider>
      <SearchResultsView
        results={results}
        onRequestDownload={onRequestDownload}
      />
    </StaccatoThemeProvider>,
  );
  return { onRequestDownload };
}

beforeEach(() => jest.clearAllMocks());

describe("SearchResultsView", () => {
  it("renders all three grouped sections", () => {
    renderResults();
    expect(screen.getByText("Tracks")).toBeTruthy();
    expect(screen.getByText("Albums")).toBeTruthy();
    expect(screen.getByText("Artists")).toBeTruthy();
  });

  it("renders the top result", () => {
    renderResults();
    expect(screen.getByText("Top result")).toBeTruthy();
  });

  it("shows a duration but no request button on recording rows", () => {
    renderResults();
    expect(screen.getByText("4:14")).toBeTruthy();
    // Recordings carry no release-group, so they can't be requested.
    expect(screen.queryByLabelText("Request Dreams via Lidarr")).toBeNull();
  });

  it("requests a download from a release row", () => {
    const { onRequestDownload } = renderResults();
    fireEvent.press(screen.getByLabelText("Request Rumours via Lidarr"));
    expect(onRequestDownload).toHaveBeenCalledWith(
      expect.objectContaining({
        releaseGroupMbid: "rg-1",
        artistMbid: "artist-1",
        artistName: "Fleetwood Mac",
        title: "Rumours",
      }),
    );
  });

  it("renders an empty state when there are no results", () => {
    renderResults({
      recordings: [],
      releases: [],
      artists: [],
      topResult: null,
    });
    expect(screen.getByText("No results found.")).toBeTruthy();
  });
});
