import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";

import { StaccatoThemeProvider } from "@/theme";

import { MediaTile, type MediaTileItem } from "./media-tile";

// MediaTile renders artwork via StaccatoImage, which reads the session.
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

const playlist: MediaTileItem = {
  id: "p1",
  title: "Workout Fuel",
  subtitle: "31 tracks",
  gradientKey: "amber",
  artUrls: [
    "https://example.com/1.jpg",
    "https://example.com/2.jpg",
    "https://example.com/3.jpg",
    "https://example.com/4.jpg",
  ],
};

function renderTile(props: Partial<React.ComponentProps<typeof MediaTile>>) {
  return render(
    <StaccatoThemeProvider>
      <MediaTile item={album} size={140} {...props} />
    </StaccatoThemeProvider>,
  );
}

describe("MediaTile", () => {
  it("renders the title and subtitle", () => {
    renderTile({});
    expect(screen.getByText("Blue")).toBeOnTheScreen();
    expect(screen.getByText("Joni Mitchell")).toBeOnTheScreen();
  });

  it("calls onPress when tapped", () => {
    const onPress = jest.fn();
    renderTile({ onPress });
    fireEvent.press(screen.getByLabelText("Blue"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("renders a 4-tile mosaic when the item has 4 artUrls", () => {
    renderTile({ item: playlist });
    expect(screen.getByText("Workout Fuel")).toBeOnTheScreen();
    expect(screen.getAllByTestId("album-art-image")).toHaveLength(4);
  });
});
