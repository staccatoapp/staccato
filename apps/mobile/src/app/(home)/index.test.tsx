import { render, screen } from "@testing-library/react-native";
import React from "react";

import {
  type PlaylistListResponse,
  type RecommendedPlaylistsResponse,
} from "@staccato/shared";
import { type HomeAlbum } from "@/lib/home-types";
import { StaccatoThemeProvider } from "@/theme";

import HomeScreen from "./index";

const mockUsePlaylists = jest.fn();
const mockUseRecommendedPlaylists = jest.fn();
const mockUseRecentlyPlayed = jest.fn();

jest.mock("@/hooks/use-playlists", () => ({
  usePlaylists: () => mockUsePlaylists(),
}));
jest.mock("@/hooks/use-recommended-playlists", () => ({
  useRecommendedPlaylists: () => mockUseRecommendedPlaylists(),
}));
jest.mock("@/hooks/use-recently-played", () => ({
  useRecentlyPlayed: () => mockUseRecentlyPlayed(),
}));

// Artwork renders via StaccatoImage, which reads the session.
jest.mock("@/lib/session", () => ({
  useSession: () => ({ session: null }),
}));

const fixturePlaylistsData: PlaylistListResponse = {
  items: [
    {
      id: "p1",
      name: "Morning Chill",
      trackCount: 14,
      coverArtUrls: [],
      description: null,
      updatedAt: null,
    },
    {
      id: "p2",
      name: "Late Night Drive",
      trackCount: 22,
      coverArtUrls: [],
      description: null,
      updatedAt: null,
    },
    {
      id: "p3",
      name: "Workout Fuel",
      trackCount: 31,
      coverArtUrls: [],
      description: null,
      updatedAt: null,
    },
  ],
  total: 3,
};

const fixtureRecData: RecommendedPlaylistsResponse = {
  status: "ready",
  data: [
    {
      id: "rp1",
      name: "Songs for Night Drives",
      description: "Fleetwood Mac, Talking Heads & more",
      trackCount: 28,
      tracks: [
        {
          recordingMbid: null,
          title: "The Chain",
          artistName: "Fleetwood Mac",
          artistMbid: null,
          albumTitle: null,
          releaseGroupMbid: null,
          durationMs: null,
          coverArtUrl: null,
          inLibrary: false,
          localTrackId: null,
        },
      ],
      coverArtUrl: null,
      expiresAt: null,
      source: "staccato",
    },
  ],
};

const fixtureRecentlyPlayed: HomeAlbum[] = [
  {
    id: "1",
    title: "Rumours",
    artistName: "Fleetwood Mac",
    releaseYear: 1977,
    gradientKey: "sunset",
    artUrl: null,
  },
  {
    id: "3",
    title: "Blue",
    artistName: "Joni Mitchell",
    releaseYear: 1971,
    gradientKey: "sea",
    artUrl: null,
  },
  {
    id: "6",
    title: "In the Aeroplane Over the Sea",
    artistName: "Neutral Milk Hotel",
    releaseYear: 1998,
    gradientKey: "dusk",
    artUrl: null,
  },
];

function renderHome() {
  mockUsePlaylists.mockReturnValue({
    data: fixturePlaylistsData,
    isLoading: false,
    isError: false,
  });
  mockUseRecommendedPlaylists.mockReturnValue({
    data: fixtureRecData,
    isLoading: false,
    isError: false,
  });
  mockUseRecentlyPlayed.mockReturnValue(fixtureRecentlyPlayed);
  return render(
    <StaccatoThemeProvider>
      <HomeScreen />
    </StaccatoThemeProvider>,
  );
}

describe("HomeScreen", () => {
  it("renders the hero and all three carousel sections", () => {
    renderHome();
    expect(screen.getByText("RECOMMENDED FOR YOU")).toBeOnTheScreen();
    expect(
      screen.getAllByText("Songs for Night Drives").length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("Recently played")).toBeOnTheScreen();
    expect(screen.getByText("Made for you")).toBeOnTheScreen();
    expect(screen.getByText("Your playlists")).toBeOnTheScreen();
  });

  it("renders the quick-start grid mixing playlists and recent albums", () => {
    renderHome();
    expect(screen.getAllByText("Morning Chill").length).toBeGreaterThan(1);
    expect(screen.getAllByText("Rumours").length).toBeGreaterThan(1);
  });

  it("drops the hero when there is no recommended playlist", () => {
    mockUsePlaylists.mockReturnValue({
      data: fixturePlaylistsData,
      isLoading: false,
      isError: false,
    });
    mockUseRecommendedPlaylists.mockReturnValue({
      data: { status: "warming" },
      isLoading: false,
      isError: false,
    });
    mockUseRecentlyPlayed.mockReturnValue(fixtureRecentlyPlayed);
    render(
      <StaccatoThemeProvider>
        <HomeScreen />
      </StaccatoThemeProvider>,
    );
    expect(screen.queryByText("RECOMMENDED FOR YOU")).not.toBeOnTheScreen();
    expect(screen.getByText("Recently played")).toBeOnTheScreen();
    expect(screen.getAllByText("Morning Chill").length).toBeGreaterThan(1);
  });
});
