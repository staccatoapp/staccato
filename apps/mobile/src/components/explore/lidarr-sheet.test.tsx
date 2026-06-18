import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";

import { StaccatoThemeProvider } from "@/theme";
import { AddAlbumSheet, type LidarrSubject } from "./add-album-sheet";

const mockMutate = jest.fn();
const mockUseRequestDownload = jest.fn();
jest.mock("@/hooks/use-request-download", () => ({
  useRequestDownload: () => mockUseRequestDownload(),
}));

jest.mock("@/lib/session", () => ({
  useSession: () => ({
    session: { serverUrl: "https://music.home.arpa", token: "tok" },
  }),
}));

const SUBJECT: LidarrSubject = {
  releaseGroupMbid: "rg-1",
  artistMbid: "artist-1",
  artistName: "Fleetwood Mac",
  albumTitle: "Rumours",
  coverArtUrl: null,
  title: "Rumours",
};

function renderSheet(subject: LidarrSubject | null = SUBJECT) {
  const onClose = jest.fn();
  render(
    <StaccatoThemeProvider>
      <AddAlbumSheet subject={subject} onClose={onClose} />
    </StaccatoThemeProvider>,
  );
  return { onClose };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseRequestDownload.mockReturnValue({
    mutate: mockMutate,
    isPending: false,
  });
});

describe("AddAlbumSheet", () => {
  it("shows the subject and request CTA when open", () => {
    renderSheet();
    expect(screen.getByText("Rumours")).toBeTruthy();
    expect(screen.getByText("Fleetwood Mac · Rumours")).toBeTruthy();
    expect(screen.getByTestId("lidarr-sheet-request")).toBeTruthy();
  });

  it("submits the album-level request body", () => {
    renderSheet();
    fireEvent.press(screen.getByTestId("lidarr-sheet-request"));
    expect(mockMutate).toHaveBeenCalledWith(
      {
        releaseGroupMbid: "rg-1",
        artistMbid: "artist-1",
        artistName: "Fleetwood Mac",
        albumTitle: "Rumours",
      },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    );
  });

  it("dismisses from the backdrop", () => {
    const { onClose } = renderSheet();
    fireEvent.press(screen.getByTestId("lidarr-sheet-backdrop"));
    expect(onClose).toHaveBeenCalled();
  });
});
