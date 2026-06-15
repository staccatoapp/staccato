import { act, renderHook } from "@testing-library/react-native";
import React from "react";

import { PreviewProvider, usePreview } from "./preview-provider";

type StatusListener = (status: {
  playing: boolean;
  isLoaded: boolean;
  currentTime: number;
  duration: number;
  didJustFinish: boolean;
  error: string | null;
}) => void;

let statusListener: StatusListener | null = null;

const mockPlayer = {
  play: jest.fn(),
  pause: jest.fn(),
  seekTo: jest.fn().mockResolvedValue(undefined),
  replace: jest.fn(),
  addListener: jest.fn((_event: string, cb: StatusListener) => {
    statusListener = cb;
    return { remove: jest.fn() };
  }),
};

let mockStatus: {
  playing: boolean;
  isLoaded: boolean;
  currentTime: number;
  duration: number;
  didJustFinish: boolean;
  error: string | null;
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

jest.mock("@/lib/session", () => ({
  useSession: () => ({
    session: { serverUrl: "https://music.home.arpa", token: "tok" },
  }),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  return <PreviewProvider>{children}</PreviewProvider>;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  statusListener = null;
  mockStatus = {
    playing: false,
    isLoaded: true,
    currentTime: 0,
    duration: 30,
    didJustFinish: false,
    error: null,
  };
  mockUsePlayback.mockReturnValue({
    isPlaying: true,
    togglePlay: mockTogglePlay,
  });
});

afterEach(() => {
  jest.useRealTimers();
});

describe("PreviewProvider", () => {
  it("streams the clip through the preview proxy with auth and pauses main playback", () => {
    const { result } = renderHook(() => usePreview(), { wrapper });
    act(() => {
      result.current.togglePreview("rec-1", "Fleetwood Mac", "Dreams");
    });
    expect(mockTogglePlay).toHaveBeenCalledTimes(1);
    expect(mockPlayer.replace).toHaveBeenCalledWith({
      uri: "https://music.home.arpa/api/preview/rec-1/stream?artistName=Fleetwood+Mac&trackTitle=Dreams",
      headers: { Authorization: "Bearer tok" },
    });
    expect(mockPlayer.play).toHaveBeenCalled();
    expect(result.current.previewingId).toBe("rec-1");
  });

  it("stops when the same track is toggled again", () => {
    const { result } = renderHook(() => usePreview(), { wrapper });
    act(() => result.current.togglePreview("rec-1", "A", "T"));
    act(() => result.current.togglePreview("rec-1", "A", "T"));
    expect(mockPlayer.pause).toHaveBeenCalled();
    expect(result.current.previewingId).toBeNull();
  });

  it("marks a track unavailable when its clip reports a load error", () => {
    const { result } = renderHook(() => usePreview(), { wrapper });
    act(() => result.current.togglePreview("rec-3", "A", "T"));
    act(() =>
      statusListener?.({
        playing: false,
        isLoaded: false,
        currentTime: 0,
        duration: 0,
        didJustFinish: false,
        error: "404",
      }),
    );
    expect(result.current.isPreviewUnavailable("rec-3")).toBe(true);
    expect(result.current.previewingId).toBeNull();
  });

  it("marks a track unavailable when its clip never loads", () => {
    // A clip that never reports isLoaded (the proxy had no preview to serve)
    // falls through to the load-timeout backstop.
    mockStatus = { ...mockStatus, isLoaded: false };
    const { result } = renderHook(() => usePreview(), { wrapper });
    act(() => result.current.togglePreview("rec-2", "A", "T"));
    act(() => jest.advanceTimersByTime(8000));
    expect(result.current.isPreviewUnavailable("rec-2")).toBe(true);
    expect(result.current.previewingId).toBeNull();
  });

  it("does not re-preview a track already known to be unavailable", () => {
    mockStatus = { ...mockStatus, isLoaded: false };
    const { result } = renderHook(() => usePreview(), { wrapper });
    act(() => result.current.togglePreview("rec-2", "A", "T"));
    act(() => jest.advanceTimersByTime(8000));
    mockPlayer.replace.mockClear();
    act(() => result.current.togglePreview("rec-2", "A", "T"));
    expect(mockPlayer.replace).not.toHaveBeenCalled();
  });
});
