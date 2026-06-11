import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";

import { type HomeRecPlaylist } from "@/lib/home-types";
import { StaccatoThemeProvider } from "@/theme";

import { HeroRec } from "./hero-rec";

const playlist: HomeRecPlaylist = {
  id: "rp1",
  name: "Songs for Night Drives",
  trackCount: 28,
  artistSummary: "Fleetwood Mac, Talking Heads, Prince & more",
  gradientKey: "berry",
  artUrl: null,
};

function renderHero(onPlay?: () => void) {
  return render(
    <StaccatoThemeProvider>
      <HeroRec playlist={playlist} onPlay={onPlay} />
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

  it("fires onPlay when the play button is pressed", () => {
    const onPlay = jest.fn();
    renderHero(onPlay);
    fireEvent.press(screen.getByRole("button", { name: "Play" }));
    expect(onPlay).toHaveBeenCalledTimes(1);
  });
});
