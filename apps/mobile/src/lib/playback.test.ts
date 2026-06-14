import type { SyncedLyricsLine } from "@staccato/shared";

import { formatPlayerTime, getActiveLyricIndex } from "./playback";

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
