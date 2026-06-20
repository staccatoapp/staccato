import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";

import { type HomeRecPlaylist } from "@/lib/home-types";
import { StaccatoThemeProvider } from "@/theme";

import { HeroRec } from "./hero-rec";

// HeroRec now renders artwork via AlbumArt → StaccatoImage, which reads the session.
jest.mock("@/lib/session", () => ({
  useSession: () => ({
    session: { serverUrl: "https://music.example.com", token: "tok" },
  }),
}));

const playlist: HomeRecPlaylist = {
  id: "rp1",
  name: "Songs for Night Drives",
  trackCount: 28,
  artistSummary: "Fleetwood Mac, Talking Heads, Prince & more",
  gradientKey: "berry",
  artUrl: null,
};

function renderHero(onPress?: () => void) {
  return render(
    <StaccatoThemeProvider>
      <HeroRec playlist={playlist} onPress={onPress} />
    </StaccatoThemeProvider>,
  );
}

describe("HeroRec", () => {
  it("renders the recommendation label", () => {
    renderHero();
    expect(screen.getByText("RECOMMENDED FOR YOU")).toBeOnTheScreen();
  });

  it("renders the playlist name, track count and artists", () => {
    renderHero();
    expect(screen.getByText("Songs for Night Drives")).toBeOnTheScreen();
    expect(screen.getByText("Playlist · 28 songs")).toBeOnTheScreen();
    expect(
      screen.getByText("Fleetwood Mac, Talking Heads, Prince & more"),
    ).toBeOnTheScreen();
  });

  it("fires onPress when the card is pressed", () => {
    const onPress = jest.fn();
    renderHero(onPress);
    fireEvent.press(
      screen.getByRole("button", { name: "Songs for Night Drives" }),
    );
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
