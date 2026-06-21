import { render, screen } from "@testing-library/react-native";
import React from "react";

import { StaccatoThemeProvider } from "@/theme";
import { type DownloadedCollection } from "@/stores/downloads-store";

import { AvailableOfflineGrid } from "./available-offline-grid";

// Artwork renders via StaccatoImage, which reads the session.
jest.mock("@/lib/session", () => ({
  useSession: () => ({ session: null }),
}));

const items: DownloadedCollection[] = [
  {
    id: "pl-1",
    kind: "playlist",
    name: "Roadtrip",
    coverArtUrls: [],
    trackIds: ["t1", "t2", "t3"],
    snapshot: {},
    downloadedAt: 2,
  },
  {
    id: "al-1",
    kind: "album",
    name: "Rumours",
    coverArtUrls: [],
    trackIds: ["a"],
    snapshot: {},
    downloadedAt: 1,
  },
];

function renderGrid(list = items) {
  render(
    <StaccatoThemeProvider>
      <AvailableOfflineGrid items={list} />
    </StaccatoThemeProvider>,
  );
}

describe("AvailableOfflineGrid", () => {
  it("renders the section header and item count", () => {
    renderGrid();
    expect(screen.getByText("Available offline")).toBeOnTheScreen();
    expect(screen.getByText("2 items")).toBeOnTheScreen();
  });

  it("renders a cell per collection with a kind + track-count subtitle", () => {
    renderGrid();
    expect(screen.getByText("Roadtrip")).toBeOnTheScreen();
    expect(screen.getByText("Playlist · 3 tracks")).toBeOnTheScreen();
    expect(screen.getByText("Rumours")).toBeOnTheScreen();
    expect(screen.getByText("Album · 1 track")).toBeOnTheScreen();
  });

  it("uses the singular item label for a single download", () => {
    renderGrid([items[1]!]);
    expect(screen.getByText("1 item")).toBeOnTheScreen();
  });
});
