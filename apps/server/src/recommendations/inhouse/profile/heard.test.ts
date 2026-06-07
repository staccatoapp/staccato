import { describe, expect, it } from "vitest";
import { buildHeardIndex } from "./heard.js";

const rows = [
  { recordingMbid: "mbid-1", playCount: 3, lastListenedAtMs: 1000 },
  { recordingMbid: "mbid-2", playCount: 1, lastListenedAtMs: 2000 },
  { recordingMbid: null, playCount: 9, lastListenedAtMs: 3000 },
];

describe("buildHeardIndex", () => {
  it("reports heard tracks by mbid", () => {
    const heard = buildHeardIndex(rows);
    expect(heard.isHeard("mbid-1")).toBe(true);
    expect(heard.isHeard("unknown")).toBe(false);
  });

  it("exposes play count and last-played per mbid", () => {
    const heard = buildHeardIndex(rows);
    expect(heard.playCount("mbid-1")).toBe(3);
    expect(heard.lastPlayed("mbid-2")).toBe(2000);
  });

  it("returns 0 / null for unheard mbids", () => {
    const heard = buildHeardIndex(rows);
    expect(heard.playCount("nope")).toBe(0);
    expect(heard.lastPlayed("nope")).toBeNull();
  });

  it("ignores rows without an mbid", () => {
    const heard = buildHeardIndex(rows);
    expect(heard.size).toBe(2);
  });
});
