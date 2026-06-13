import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";

import { StaccatoThemeProvider } from "@/theme";
import { TransportControls } from "./transport-controls";

const mockUsePlayback = jest.fn();
jest.mock("@/providers/playback-provider", () => ({
  usePlayback: () => mockUsePlayback(),
}));

function playbackValue(overrides: Record<string, unknown> = {}) {
  return {
    isPlaying: false,
    togglePlay: jest.fn(),
    next: jest.fn(),
    prev: jest.fn(),
    ...overrides,
  };
}

function renderControls(value = playbackValue()) {
  mockUsePlayback.mockReturnValue(value);
  render(
    <StaccatoThemeProvider>
      <TransportControls />
    </StaccatoThemeProvider>,
  );
  return value;
}

beforeEach(() => jest.clearAllMocks());

describe("TransportControls", () => {
  it("renders shuffle and repeat as disabled (no server support yet)", () => {
    renderControls();
    expect(screen.getByTestId("transport-shuffle")).toBeDisabled();
    expect(screen.getByTestId("transport-repeat")).toBeDisabled();
  });

  it("shows play when paused and pause when playing", () => {
    renderControls(playbackValue({ isPlaying: false }));
    expect(screen.getByTestId("transport-play-icon")).toBeTruthy();

    renderControls(playbackValue({ isPlaying: true }));
    expect(screen.getByTestId("transport-pause-icon")).toBeTruthy();
  });

  it("wires play/pause, next, and previous to the playback context", () => {
    const value = renderControls();
    fireEvent.press(screen.getByTestId("transport-play-pause"));
    fireEvent.press(screen.getByTestId("transport-next"));
    fireEvent.press(screen.getByTestId("transport-prev"));
    expect(value.togglePlay).toHaveBeenCalledTimes(1);
    expect(value.next).toHaveBeenCalledTimes(1);
    expect(value.prev).toHaveBeenCalledTimes(1);
  });
});
