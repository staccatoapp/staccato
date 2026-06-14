import { describe, expect, it } from "vitest";
import {
  computePlayDelta,
  getNextTrackState,
  getPrevTrackState,
} from "./transitions.js";

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
