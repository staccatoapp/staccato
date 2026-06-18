import { fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";
import React from "react";

import {
  type PlaylistListResponse,
  type RecommendedPlaylistsResponse,
} from "@staccato/shared";
import { type HomeAlbum, type HomePlaylist } from "@/lib/home-types";
import { StaccatoThemeProvider } from "@/theme";

import HomeScreen from "./index";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn() },
}));

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
  ],
  total: 1,
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

// Recently played mixes albums and playlists; names are distinct from the
// "Your playlists" carousel so label lookups are unambiguous.
const recentAlbum: HomeAlbum = {
  id: "al-1",
  title: "Rumours",
  artistName: "Fleetwood Mac",
  releaseYear: 1977,
  gradientKey: "sunset",
  artUrl: null,
};
const recentPlaylist: HomePlaylist = {
  id: "pl-9",
  name: "Night Owls",
  trackCount: 12,
  gradientKey: "sea",
  artUrls: [],
};

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
  mockUseRecentlyPlayed.mockReturnValue([recentAlbum, recentPlaylist]);
  return render(
    <StaccatoThemeProvider>
      <HomeScreen />
    </StaccatoThemeProvider>,
  );
}

describe("HomeScreen", () => {
  beforeEach(() => jest.clearAllMocks());

  it("renders the hero and the Made-for-you / Your-playlists carousels", () => {
    renderHome();
    expect(screen.getByText("RECOMMENDED FOR YOU")).toBeOnTheScreen();
    expect(
      screen.getAllByText("Songs for Night Drives").length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("Made for you")).toBeOnTheScreen();
    expect(screen.getByText("Your playlists")).toBeOnTheScreen();
  });

  it("no longer renders a standalone Recently played carousel", () => {
    renderHome();
    expect(screen.queryByText("Recently played")).not.toBeOnTheScreen();
  });

  it("renders recently-played albums and playlists in the quick-start grid", () => {
    renderHome();
    expect(screen.getByText("Rumours")).toBeOnTheScreen();
    expect(screen.getByText("Night Owls")).toBeOnTheScreen();
  });

  it("opens the album detail when a recently-played album tile is tapped", () => {
    renderHome();
    fireEvent.press(screen.getByLabelText("Rumours"));
    expect(router.push).toHaveBeenCalledWith({
      pathname: "/(protected)/(home)/album/[albumKey]",
      params: { albumKey: "al-1" },
    });
  });

  it("opens the playlist detail when a recently-played playlist tile is tapped", () => {
    renderHome();
    fireEvent.press(screen.getByLabelText("Night Owls"));
    expect(router.push).toHaveBeenCalledWith({
      pathname: "/(protected)/(home)/playlist/[playlistKey]",
      params: { playlistKey: "pl-9" },
    });
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
    mockUseRecentlyPlayed.mockReturnValue([recentAlbum, recentPlaylist]);
    render(
      <StaccatoThemeProvider>
        <HomeScreen />
      </StaccatoThemeProvider>,
    );
    expect(screen.queryByText("RECOMMENDED FOR YOU")).not.toBeOnTheScreen();
    expect(screen.getByText("Rumours")).toBeOnTheScreen();
  });
});
