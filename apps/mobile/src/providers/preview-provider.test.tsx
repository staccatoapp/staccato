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

beforeEach(() => {
  jest.clearAllMocks();
  mockUsePlayback.mockReturnValue({
    isPlaying: true,
    togglePlay: mockTogglePlay,
  });
});

describe("PreviewProvider", () => {
  it("starts a preview and pauses main playback", () => {
    const { result } = renderHook(() => usePreview(), { wrapper });
    act(() => {
      result.current.togglePreview("rec-1", "https://preview.example/clip.mp3");
    });
    expect(mockTogglePlay).toHaveBeenCalledTimes(1);
    expect(mockPlayer.replace).toHaveBeenCalledWith({
      uri: "https://preview.example/clip.mp3",
    });
    expect(mockPlayer.play).toHaveBeenCalled();
    expect(result.current.previewingId).toBe("rec-1");
  });

  it("stops when the same track is toggled again", () => {
    const { result } = renderHook(() => usePreview(), { wrapper });
    act(() => {
      result.current.togglePreview("rec-1", "https://preview.example/clip.mp3");
    });
    act(() => {
      result.current.togglePreview("rec-1", "https://preview.example/clip.mp3");
    });
    expect(mockPlayer.pause).toHaveBeenCalled();
    expect(result.current.previewingId).toBeNull();
  });

  it("ignores a track with no preview url", () => {
    const { result } = renderHook(() => usePreview(), { wrapper });
    act(() => {
      result.current.togglePreview("rec-2", null);
    });
    expect(mockPlayer.replace).not.toHaveBeenCalled();
    expect(result.current.previewingId).toBeNull();
  });
});
