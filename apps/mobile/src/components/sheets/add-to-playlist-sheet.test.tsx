import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";
import type { PlaylistListItem } from "@staccato/shared";

import { StaccatoThemeProvider } from "@/theme";
import { AddToPlaylistSheet } from "./add-to-playlist-sheet";

jest.mock("@/lib/session", () => ({
  useSession: () => ({
    session: { serverUrl: "https://music.home.arpa", token: "tok" },
  }),
}));

const mockUseLibraryPlaylists = jest.fn();
jest.mock("@/hooks/use-library-playlists", () => ({
  useLibraryPlaylists: (...args: unknown[]) => mockUseLibraryPlaylists(...args),
}));

const mockMutate = jest.fn();
jest.mock("@/hooks/use-add-track-to-playlist", () => ({
  useAddTrackToPlaylist: () => ({ mutate: mockMutate, isPending: false }),
}));

const mockToast = { success: jest.fn(), error: jest.fn() };
jest.mock("@/components/ui/staccato-toast", () => ({
  staccatoToast: {
    success: (m: string) => mockToast.success(m),
    error: (m: string) => mockToast.error(m),
  },
}));

function playlist(id: string, name: string, trackCount = 10): PlaylistListItem {
  return {
    id,
    name,
    description: null,
    trackCount,
    coverArtUrls: [],
    updatedAt: null,
  };
}

const PLAYLISTS = [
  playlist("pl-1", "Liked Songs", 128),
  playlist("pl-2", "Road Trip", 42),
];

function renderSheet(overrides: Record<string, unknown> = {}) {
  mockUseLibraryPlaylists.mockReturnValue({
    items: PLAYLISTS,
    fetchNextPage: jest.fn(),
    hasNextPage: false,
    isLoading: false,
    ...overrides,
  });
  const onClose = jest.fn();
  render(
    <StaccatoThemeProvider>
      <AddToPlaylistSheet open onClose={onClose} trackId="t1" />
    </StaccatoThemeProvider>,
  );
  return { onClose };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("AddToPlaylistSheet", () => {
  it("lists the user's playlists", () => {
    renderSheet();
    expect(screen.getByText("Add to playlist")).toBeTruthy();
    expect(screen.getByText("Liked Songs")).toBeTruthy();
    expect(screen.getByText("Road Trip")).toBeTruthy();
  });

  it("filters the list by the search query", () => {
    renderSheet();
    fireEvent.changeText(screen.getByTestId("add-to-playlist-search"), "road");
    expect(screen.queryByText("Liked Songs")).toBeNull();
    expect(screen.getByText("Road Trip")).toBeTruthy();
  });

  it("adds the track, closes, and toasts on success", () => {
    mockMutate.mockImplementation((_vars, opts) => opts.onSuccess?.());
    const { onClose } = renderSheet();

    fireEvent.press(screen.getByRole("button", { name: "Add to Road Trip" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockMutate).toHaveBeenCalledWith(
      { playlistId: "pl-2", trackId: "t1" },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    );
    expect(mockToast.success).toHaveBeenCalledTimes(1);
    expect(mockToast.error).not.toHaveBeenCalled();
  });

  it("toasts an error when the save fails", () => {
    mockMutate.mockImplementation((_vars, opts) =>
      opts.onError?.(new Error("boom")),
    );
    renderSheet();

    fireEvent.press(screen.getByRole("button", { name: "Add to Liked Songs" }));

    expect(mockToast.error).toHaveBeenCalledTimes(1);
    expect(mockToast.success).not.toHaveBeenCalled();
  });

  it("does not add or close from the non-functional New Playlist button", () => {
    const { onClose } = renderSheet();
    fireEvent.press(screen.getByRole("button", { name: "New playlist" }));
    expect(mockMutate).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("clears the search query when the sheet closes and reopens", () => {
    mockUseLibraryPlaylists.mockReturnValue({
      items: PLAYLISTS,
      fetchNextPage: jest.fn(),
      hasNextPage: false,
      isLoading: false,
    });
    const sheet = (open: boolean) => (
      <StaccatoThemeProvider>
        <AddToPlaylistSheet open={open} onClose={jest.fn()} trackId="t1" />
      </StaccatoThemeProvider>
    );
    const { rerender } = render(sheet(true));

    // Filter down to a single playlist.
    fireEvent.changeText(screen.getByTestId("add-to-playlist-search"), "road");
    expect(screen.getByTestId("add-to-playlist-search").props.value).toBe(
      "road",
    );
    expect(screen.queryByText("Liked Songs")).toBeNull();

    // Close, then reopen for a different track.
    rerender(sheet(false));
    rerender(sheet(true));

    expect(screen.getByTestId("add-to-playlist-search").props.value).toBe("");
    expect(screen.getByText("Liked Songs")).toBeTruthy();
    expect(screen.getByText("Road Trip")).toBeTruthy();
  });
});
