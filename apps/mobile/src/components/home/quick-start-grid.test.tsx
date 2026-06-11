import { render, screen } from "@testing-library/react-native";
import React from "react";

import { type HomeAlbum, type HomePlaylist } from "@/lib/home-types";
import { StaccatoThemeProvider } from "@/theme";

import { QuickStartGrid } from "./quick-start-grid";

// Cells render artwork via StaccatoImage, which reads the session.
jest.mock("@/lib/session", () => ({
  useSession: () => ({ session: null }),
}));

const album: HomeAlbum = {
  id: "a1",
  title: "Rumours",
  artistName: "Fleetwood Mac",
  releaseYear: 1977,
  gradientKey: "sunset",
  artUrl: null,
};

const playlist: HomePlaylist = {
  id: "p1",
  name: "Morning Chill",
  trackCount: 14,
  gradientKey: "sea",
  artUrl: null,
};

function renderGrid(items: (HomeAlbum | HomePlaylist)[]) {
  return render(
    <StaccatoThemeProvider>
      <QuickStartGrid items={items} />
    </StaccatoThemeProvider>,
  );
}

describe("QuickStartGrid", () => {
  it("renders album cells with the artist as subtitle", () => {
    renderGrid([album]);
    expect(screen.getByText("Rumours")).toBeOnTheScreen();
    expect(screen.getByText("Fleetwood Mac")).toBeOnTheScreen();
  });

  it("renders playlist cells with the track count as subtitle", () => {
    renderGrid([playlist]);
    expect(screen.getByText("Morning Chill")).toBeOnTheScreen();
    expect(screen.getByText("Playlist · 14 tracks")).toBeOnTheScreen();
  });

  it("caps the grid at six cells", () => {
    const items = Array.from({ length: 8 }, (_, i) => ({
      ...album,
      id: `a${i}`,
      title: `Album ${i}`,
    }));
    renderGrid(items);
    expect(screen.getByText("Album 5")).toBeOnTheScreen();
    expect(screen.queryByText("Album 6")).not.toBeOnTheScreen();
  });
});
