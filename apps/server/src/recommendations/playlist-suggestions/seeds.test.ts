import { describe, expect, it } from "vitest";
import { buildSeeds, type PlaylistSeedRow } from "./seeds.js";

function row(p: Partial<PlaylistSeedRow>): PlaylistSeedRow {
  return {
    trackId: "t",
    title: "Title",
    artistName: "Artist",
    recordingMbid: null,
    artistMbid: null,
    addedAt: null,
    ...p,
  };
}

describe("buildSeeds", () => {
  it("returns [] below MIN_SEEDS (cold-start gate)", () => {
    expect(buildSeeds([row({}), row({})])).toEqual([]);
  });

  it("prefers most-recently-added and caps at SEED_CAP", () => {
    const rows = Array.from({ length: 35 }, (_, i) =>
      row({ title: `t${i}`, addedAt: new Date(i * 1000) }),
    );
    const seeds = buildSeeds(rows);
    expect(seeds).toHaveLength(30);
    expect(seeds[0]!.title).toBe("t34"); // newest first
  });

  it("maps artist/title and does NOT carry the recording MBID into the seed", () => {
    // The recording MBID is deliberately dropped: seeds address Last.fm's
    // track.getSimilar by name, never by the (poorly-covered) recording MBID.
    const seeds = buildSeeds([
      row({
        recordingMbid: "rec-1",
        title: "A",
        artistName: "X",
        addedAt: new Date(3),
      }),
      row({
        recordingMbid: null,
        title: "B",
        artistName: "Y",
        addedAt: new Date(2),
      }),
      row({
        recordingMbid: null,
        title: "C",
        artistName: "Z",
        addedAt: new Date(1),
      }),
    ]);
    expect(seeds[0]).toEqual({ title: "A", artist: "X" });
    expect(seeds[1]).toEqual({ title: "B", artist: "Y" });
  });
});
