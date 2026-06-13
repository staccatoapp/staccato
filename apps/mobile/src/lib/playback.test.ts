import type { SyncedLyricsLine } from "@staccato/shared";

import {
  computePlayDelta,
  formatPlayerTime,
  getActiveLyricIndex,
  getNextTrackState,
  getPrevTrackState,
} from "./playback";

describe("formatPlayerTime", () => {
  it("formats zero", () => {
    expect(formatPlayerTime(0)).toBe("0:00");
  });

  it("pads seconds", () => {
    expect(formatPlayerTime(63)).toBe("1:03");
  });

  it("floors fractional seconds", () => {
    expect(formatPlayerTime(63.9)).toBe("1:03");
  });

  it("handles 10+ minute tracks", () => {
    expect(formatPlayerTime(754)).toBe("12:34");
  });

  it("clamps negatives to zero", () => {
    expect(formatPlayerTime(-5)).toBe("0:00");
  });
});

describe("getActiveLyricIndex", () => {
  const lines: SyncedLyricsLine[] = [
    { startingTime: 0, lyrics: "First" },
    { startingTime: 5, lyrics: "Second" },
    { startingTime: 12, lyrics: "" },
    { startingTime: 20, lyrics: "Fourth" },
  ];

  it("returns 0 before the second line starts", () => {
    expect(getActiveLyricIndex(lines, 3)).toBe(0);
  });

  it("returns the line whose timestamp was just passed", () => {
    expect(getActiveLyricIndex(lines, 6)).toBe(1);
  });

  it("returns the index at an exact timestamp", () => {
    expect(getActiveLyricIndex(lines, 5)).toBe(1);
  });

  it("returns the last index when position is past all lines", () => {
    expect(getActiveLyricIndex(lines, 999)).toBe(3);
  });

  it("returns 0 for an empty array", () => {
    expect(getActiveLyricIndex([], 10)).toBe(0);
  });
});

describe("computePlayDelta", () => {
  it("returns the elapsed delta during normal playback", () => {
    expect(computePlayDelta(10, 10.5)).toBeCloseTo(0.5);
  });

  it("returns 0 when time moved backwards (seek back)", () => {
    expect(computePlayDelta(30, 10)).toBe(0);
  });

  it("returns 0 for a jump too large to be playback (seek forward)", () => {
    expect(computePlayDelta(10, 60)).toBe(0);
  });

  it("returns 0 when there is no previous sample", () => {
    expect(computePlayDelta(null, 10)).toBe(0);
  });
});

describe("getNextTrackState", () => {
  it("advances to the next track", () => {
    expect(getNextTrackState(0, 3)).toEqual({
      isPlaying: true,
      currentTrackIndex: 1,
      currentTrackPositionInSeconds: 0,
      currentTrackAccumulatedPlayTimeInSeconds: 0,
      currentTrackListenEventCreated: false,
    });
  });

  it("stays on the last track and stops playing", () => {
    expect(getNextTrackState(2, 3)).toEqual({
      isPlaying: false,
      currentTrackIndex: 2,
      currentTrackPositionInSeconds: 0,
      currentTrackAccumulatedPlayTimeInSeconds: 0,
      currentTrackListenEventCreated: false,
    });
  });
});

describe("getPrevTrackState", () => {
  it("restarts the current track when more than 3 seconds in", () => {
    expect(getPrevTrackState(1, 4, true, 30)).toEqual({
      isPlaying: true,
      currentTrackIndex: 1,
      currentTrackPositionInSeconds: 0,
      currentTrackAccumulatedPlayTimeInSeconds: 0,
      currentTrackListenEventCreated: false,
    });
  });

  it("goes to the previous track when 3 seconds or less in", () => {
    expect(getPrevTrackState(1, 2, true, 30)).toEqual({
      isPlaying: true,
      currentTrackIndex: 0,
      currentTrackPositionInSeconds: 0,
      currentTrackAccumulatedPlayTimeInSeconds: 0,
      currentTrackListenEventCreated: false,
    });
  });

  it("restarts the first track but keeps its accumulated play time", () => {
    // Matches web semantics: re-playing the same track is one continuous
    // listen, so the accumulator survives the restart.
    expect(getPrevTrackState(0, 2, false, 30)).toEqual({
      isPlaying: false,
      currentTrackIndex: 0,
      currentTrackPositionInSeconds: 0,
      currentTrackAccumulatedPlayTimeInSeconds: 30,
      currentTrackListenEventCreated: false,
    });
  });

  it("preserves the play/pause state", () => {
    expect(getPrevTrackState(1, 10, false, 30).isPlaying).toBe(false);
  });
});
