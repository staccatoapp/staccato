import { render, screen } from "@testing-library/react-native";
import React from "react";

import { homeData, type HomeScreenData } from "@/lib/home-data";
import { StaccatoThemeProvider } from "@/theme";

import HomeScreen from "./index";

const mockUseHomeData = jest.fn<HomeScreenData, []>();
jest.mock("@/hooks/use-home-data", () => ({
  useHomeData: () => mockUseHomeData(),
}));

function renderHome(data: HomeScreenData) {
  mockUseHomeData.mockReturnValue(data);
  return render(
    <StaccatoThemeProvider>
      <HomeScreen />
    </StaccatoThemeProvider>,
  );
}

describe("HomeScreen", () => {
  it("renders the hero and all three carousel sections", () => {
    renderHome(homeData);
    expect(screen.getByText("RECOMMENDED FOR YOU")).toBeOnTheScreen();
    expect(screen.getByText("Songs for Night Drives")).toBeOnTheScreen();
    expect(screen.getByText("Recently played")).toBeOnTheScreen();
    expect(screen.getByText("Made for you")).toBeOnTheScreen();
    expect(screen.getByText("Your playlists")).toBeOnTheScreen();
  });

  it("renders the quick-start grid mixing playlists and recent albums", () => {
    renderHome(homeData);
    // First playlist + first recent album land in the grid (and the grid
    // renders them in addition to their carousels).
    expect(screen.getAllByText("Morning Chill").length).toBeGreaterThan(1);
    expect(screen.getAllByText("Rumours").length).toBeGreaterThan(1);
  });

  it("drops the hero when there is no recommended playlist", () => {
    renderHome({ ...homeData, recPlaylist: null });
    expect(screen.queryByText("RECOMMENDED FOR YOU")).not.toBeOnTheScreen();
    expect(screen.getByText("Recently played")).toBeOnTheScreen();
    expect(screen.getAllByText("Morning Chill").length).toBeGreaterThan(1);
  });
});
