import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";

import { type MediaTileItem } from "@/components/ui/media-tile";
import { StaccatoThemeProvider } from "@/theme";

import { Carousel } from "./carousel";

// Cards render artwork via StaccatoImage, which reads the session.
jest.mock("@/lib/session", () => ({
  useSession: () => ({ session: null }),
}));

const album: MediaTileItem = {
  id: "a1",
  title: "Blue",
  subtitle: "Joni Mitchell",
  gradientKey: "sea",
  artUrl: null,
};

const mix: MediaTileItem = {
  id: "m1",
  title: "Discover Weekly",
  subtitle: "Updated Mondays",
  gradientKey: "berry",
  artUrl: null,
};

const playlist: MediaTileItem = {
  id: "p1",
  title: "Workout Fuel",
  subtitle: "31 tracks",
  gradientKey: "amber",
  artUrls: [],
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

  it("calls onPressItem with the tapped item", () => {
    const onPressItem = jest.fn();
    render(
      <StaccatoThemeProvider>
        <Carousel
          title="Made for you"
          items={[album, mix, playlist]}
          onPressItem={onPressItem}
        />
      </StaccatoThemeProvider>,
    );
    fireEvent.press(screen.getByLabelText("Discover Weekly"));
    expect(onPressItem).toHaveBeenCalledWith(mix);
  });
});
