import { describe, it, expect } from "vitest";
import {
  PlaybackSourceSchema,
  PlaybackPlayRequestSchema,
} from "./playback.js";

describe("PlaybackSourceSchema", () => {
  it("accepts an album source", () => {
    expect(
      PlaybackSourceSchema.safeParse({ type: "album", id: "album-1" }).success,
    ).toBe(true);
  });

  it("accepts a playlist source", () => {
    expect(
      PlaybackSourceSchema.safeParse({ type: "playlist", id: "pl-1" }).success,
    ).toBe(true);
  });

  it("rejects an unknown source type", () => {
    expect(
      PlaybackSourceSchema.safeParse({ type: "artist", id: "a-1" }).success,
    ).toBe(false);
  });
});

describe("PlaybackPlayRequestSchema", () => {
  it("accepts a play request without a source", () => {
    const result = PlaybackPlayRequestSchema.safeParse({
      trackIds: ["t1", "t2"],
      startIndex: 0,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a play request with a source", () => {
    const result = PlaybackPlayRequestSchema.safeParse({
      trackIds: ["t1"],
      startIndex: 0,
      source: { type: "album", id: "album-1" },
    });
    expect(result.success).toBe(true);
  });
});
