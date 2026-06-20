import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";
import type { PlaylistListItem } from "@staccato/shared";

import { StaccatoThemeProvider } from "@/theme";
import { PlaylistListItem as PlaylistRow } from "./playlist-list-item";

jest.mock("@/lib/session", () => ({
  useSession: () => ({
    session: { serverUrl: "https://music.home.arpa", token: "tok" },
  }),
}));

function playlist(overrides: Partial<PlaylistListItem> = {}): PlaylistListItem {
  return {
    id: "pl-1",
    name: "Road Trip",
    description: null,
    trackCount: 42,
    coverArtUrls: [],
    updatedAt: null,
    ...overrides,
  };
}

function renderRow(overrides: Partial<PlaylistListItem> = {}) {
  const onPress = jest.fn();
  render(
    <StaccatoThemeProvider>
      <PlaylistRow playlist={playlist(overrides)} onPress={onPress} />
    </StaccatoThemeProvider>,
  );
  return { onPress };
}

beforeEach(() => jest.clearAllMocks());

describe("PlaylistListItem", () => {
  it("shows the playlist name and track count", () => {
    renderRow();
    expect(screen.getByText("Road Trip")).toBeTruthy();
    expect(screen.getByText("42 tracks")).toBeTruthy();
  });

  it("exposes an add affordance and fires onPress when tapped", () => {
    const { onPress } = renderRow();
    fireEvent.press(screen.getByRole("button", { name: "Add to Road Trip" }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("does not fire onPress while disabled", () => {
    const onPress = jest.fn();
    render(
      <StaccatoThemeProvider>
        <PlaylistRow playlist={playlist()} onPress={onPress} disabled />
      </StaccatoThemeProvider>,
    );
    fireEvent.press(screen.getByRole("button", { name: "Add to Road Trip" }));
    expect(onPress).not.toHaveBeenCalled();
  });
});
