import { act, renderHook } from "@testing-library/react-native";
import React from "react";

import { PreviewProvider, usePreview } from "./preview-provider";

const mockPlayer = {
  play: jest.fn(),
  pause: jest.fn(),
  seekTo: jest.fn().mockResolvedValue(undefined),
  replace: jest.fn(),
};

const mockStatus = {
  playing: false,
  isLoaded: true,
  currentTime: 0,
  duration: 30,
  didJustFinish: false,
};

jest.mock("expo-audio", () => ({
  useAudioPlayer: () => mockPlayer,
  useAudioPlayerStatus: () => mockStatus,
}));

const mockTogglePlay = jest.fn();
const mockUsePlayback = jest.fn();
jest.mock("./playback-provider", () => ({
  usePlayback: () => mockUsePlayback(),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  return <PreviewProvider>{children}</PreviewProvider>;
}

const url = "https://preview.example/clip.mp3";

beforeEach(() => {
  jest.clearAllMocks();
  mockUsePlayback.mockReturnValue({
    isPlaying: true,
    togglePlay: mockTogglePlay,
  });
});

describe("PreviewProvider", () => {
  it("resolves the url, loads + plays the clip, and pauses main playback", async () => {
    const { result } = renderHook(() => usePreview(), { wrapper });
    await act(async () => {
      result.current.togglePreview("rec-1", async () => url);
    });
    expect(mockTogglePlay).toHaveBeenCalledTimes(1);
    expect(mockPlayer.replace).toHaveBeenCalledWith({ uri: url });
    expect(mockPlayer.play).toHaveBeenCalled();
    expect(result.current.previewingId).toBe("rec-1");
  });

  it("stops when the same track is toggled again", async () => {
    const { result } = renderHook(() => usePreview(), { wrapper });
    await act(async () => {
      result.current.togglePreview("rec-1", async () => url);
    });
    await act(async () => {
      result.current.togglePreview("rec-1", async () => url);
    });
    expect(mockPlayer.pause).toHaveBeenCalled();
    expect(result.current.previewingId).toBeNull();
  });

  it("ignores a track whose preview url resolves to null", async () => {
    const { result } = renderHook(() => usePreview(), { wrapper });
    await act(async () => {
      result.current.togglePreview("rec-2", async () => null);
    });
    expect(mockPlayer.replace).not.toHaveBeenCalled();
    expect(result.current.previewingId).toBeNull();
    expect(result.current.previewLoadingId).toBeNull();
  });
});
