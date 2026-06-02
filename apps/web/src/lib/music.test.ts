import { describe, expect, it } from "vitest";
import { formatMs, formatTime, generateAlbumGradient } from "./music";

describe("formatTime", () => {
  it("formats zero seconds as 0:00", () => {
    expect(formatTime(0)).toBe("0:00");
  });

  it("formats seconds under one minute", () => {
    expect(formatTime(59)).toBe("0:59");
  });

  it("formats exactly one minute", () => {
    expect(formatTime(60)).toBe("1:00");
  });

  it("formats minutes and seconds", () => {
    expect(formatTime(90)).toBe("1:30");
  });

  it("formats values above one hour", () => {
    expect(formatTime(3661)).toBe("61:01");
  });

  it("returns em-dash for null", () => {
    expect(formatTime(null)).toBe("—");
  });
});

describe("formatMs", () => {
  it("returns em-dash for null", () => {
    expect(formatMs(null)).toBe("—");
  });

  it("returns em-dash for 0ms (falsy guard)", () => {
    expect(formatMs(0)).toBe("—");
  });

  it("formats 1000ms as 0:01", () => {
    expect(formatMs(1000)).toBe("0:01");
  });

  it("formats 90000ms as 1:30", () => {
    expect(formatMs(90000)).toBe("1:30");
  });

  it("rounds sub-second values to nearest second", () => {
    // 59500ms → Math.round(59.5) = 60 → "1:00"
    expect(formatMs(59500)).toBe("1:00");
  });
});

describe("generateAlbumGradient", () => {
  it("returns a string starting with linear-gradient", () => {
    expect(generateAlbumGradient("Album", "Artist")).toMatch(
      /^linear-gradient/,
    );
  });

  it("is deterministic — same input always returns same output", () => {
    const first = generateAlbumGradient("Rumours", "Fleetwood Mac");
    const second = generateAlbumGradient("Rumours", "Fleetwood Mac");
    expect(first).toBe(second);
  });

  it("produces different gradients for different inputs", () => {
    const a = generateAlbumGradient("Rumours", "Fleetwood Mac");
    const b = generateAlbumGradient("Kind of Blue", "Miles Davis");
    expect(a).not.toBe(b);
  });
});
