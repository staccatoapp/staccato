import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";

import {
  type HomeAlbum,
  type HomeMix,
  type HomePlaylist,
} from "@/lib/home-data";
import { StaccatoThemeProvider } from "@/theme";

import { Carousel, CarouselCard } from "./carousel";

const album: HomeAlbum = {
  id: "a1",
  title: "Blue",
  artistName: "Joni Mitchell",
  releaseYear: 1971,
  gradientKey: "sea",
  artUrl: null,
};

const mix: HomeMix = {
  id: "m1",
  name: "Discover Weekly",
  subtitle: "Updated Mondays",
  gradientKey: "berry",
  artUrl: null,
};

const playlist: HomePlaylist = {
  id: "p1",
  name: "Workout Fuel",
  trackCount: 31,
  gradientKey: "amber",
  artUrl: null,
};

describe("Carousel", () => {
  it("renders the title, See all and a card per item", () => {
    const onSeeAll = jest.fn();
    render(
      <StaccatoThemeProvider>
        <Carousel
          title="Recently played"
          items={[album, mix, playlist]}
          onSeeAll={onSeeAll}
        />
      </StaccatoThemeProvider>,
    );
    expect(screen.getByText("Recently played")).toBeOnTheScreen();
    expect(screen.getByText("Blue")).toBeOnTheScreen();
    expect(screen.getByText("Discover Weekly")).toBeOnTheScreen();
    expect(screen.getByText("Workout Fuel")).toBeOnTheScreen();

    fireEvent.press(screen.getByText("See all"));
    expect(onSeeAll).toHaveBeenCalledTimes(1);
  });
});

describe("CarouselCard", () => {
  it.each([
    ["album", album, "Joni Mitchell"],
    ["mix", mix, "Updated Mondays"],
    ["playlist", playlist, "31 tracks"],
  ] as const)("derives the %s subtitle", (_kind, item, subtitle) => {
    render(
      <StaccatoThemeProvider>
        <CarouselCard item={item} />
      </StaccatoThemeProvider>,
    );
    expect(screen.getByText(subtitle)).toBeOnTheScreen();
  });
});
