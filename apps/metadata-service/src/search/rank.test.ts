import { describe, it, expect } from "vitest";
import { combinedScore, rankUnified, type RankInputs } from "./rank.js";
import type {
  MetadataSearchArtist,
  MetadataSearchRecording,
  MetadataSearchRelease,
} from "@staccato/shared";

function makeRecording(
  overrides: Partial<MetadataSearchRecording> & { recordingMbid: string },
): MetadataSearchRecording {
  return {
    title: "Song",
    artistName: "Artist",
    artistMbid: null,
    releaseName: null,
    releaseMbid: null,
    releaseGroupMbid: null,
    releaseYear: null,
    durationMs: null,
    listenCount: null,
    ...overrides,
  };
}

function makeArtist(
  overrides: Partial<MetadataSearchArtist> & { artistMbid: string },
): MetadataSearchArtist {
  return {
    name: "Artist",
    disambiguation: null,
    type: null,
    listenCount: null,
    ...overrides,
  };
}

function makeRelease(
  overrides: Partial<MetadataSearchRelease> & { releaseMbid: string },
): MetadataSearchRelease {
  return {
    releaseGroupMbid: null,
    title: "Album",
    artistName: "Artist",
    artistMbid: null,
    releaseYear: null,
    releaseType: null,
    listenCount: null,
    ...overrides,
  };
}

const emptyInputs: RankInputs = { recordings: [], artists: [], releases: [] };

describe("combinedScore", () => {
  it("returns 0 for empty query, null listenCount, and zero lexScore", () => {
    expect(combinedScore("", 0, null, "")).toBe(0);
  });

  it("increases with a higher listenCount", () => {
    const withPopularity = combinedScore("song", 0, 1_000_000, "song");
    const withoutPopularity = combinedScore("song", 0, null, "song");
    expect(withPopularity).toBeGreaterThan(withoutPopularity);
  });

  it("increases with a higher lexScore", () => {
    const withLex = combinedScore("song", 100, null, "song");
    const withoutLex = combinedScore("song", 0, null, "song");
    expect(withLex).toBeGreaterThan(withoutLex);
  });

  it("gives full coverage score when the query exactly matches the identity", () => {
    const score = combinedScore("frank ocean", 0, null, "frank ocean");
    expect(score).toBeCloseTo(0.6);
  });
});

describe("rankUnified", () => {
  it("returns empty sections and null topResult for all-empty inputs", () => {
    const result = rankUnified("anything", emptyInputs);
    expect(result.recordings).toEqual([]);
    expect(result.artists).toEqual([]);
    expect(result.releases).toEqual([]);
    expect(result.topResult).toBeNull();
  });

  it("returns topResult pointing at a recording when only recordings are provided", () => {
    const inputs: RankInputs = {
      recordings: [
        {
          item: makeRecording({
            recordingMbid: "rec-1",
            title: "Lost",
            artistName: "Ocean",
          }),
          lexScore: 80,
        },
      ],
      artists: [],
      releases: [],
    };
    const result = rankUnified("lost ocean", inputs);
    expect(result.topResult).toEqual({ type: "recording", mbid: "rec-1" });
  });

  it("returns topResult pointing at an artist when only artists are provided", () => {
    const inputs: RankInputs = {
      recordings: [],
      artists: [
        {
          item: makeArtist({ artistMbid: "art-1", name: "Frank Ocean" }),
          lexScore: 90,
        },
      ],
      releases: [],
    };
    const result = rankUnified("frank ocean", inputs);
    expect(result.topResult).toEqual({ type: "artist", mbid: "art-1" });
  });

  it("returns topResult pointing at a release when only releases are provided", () => {
    const inputs: RankInputs = {
      recordings: [],
      artists: [],
      releases: [
        {
          item: makeRelease({
            releaseMbid: "rel-1",
            title: "Blonde",
            artistName: "Frank Ocean",
          }),
          lexScore: 85,
        },
      ],
    };
    const result = rankUnified("blonde frank ocean", inputs);
    expect(result.topResult).toEqual({ type: "release", mbid: "rel-1" });
  });

  it("picks the highest-scoring entity across all sections as topResult", () => {
    const inputs: RankInputs = {
      recordings: [
        {
          item: makeRecording({
            recordingMbid: "rec-1",
            title: "Pyramids",
            artistName: "Frank Ocean",
          }),
          lexScore: 20,
        },
      ],
      artists: [
        {
          item: makeArtist({
            artistMbid: "art-1",
            name: "Frank Ocean",
            listenCount: 50_000_000,
          }),
          lexScore: 100,
        },
      ],
      releases: [
        {
          item: makeRelease({
            releaseMbid: "rel-1",
            title: "Nostalgia Ultra",
            artistName: "Frank Ocean",
          }),
          lexScore: 50,
        },
      ],
    };
    // "frank ocean" perfectly matches the artist identity, and with very high listenCount the artist should win
    const result = rankUnified("frank ocean", inputs);
    expect(result.topResult).toEqual({ type: "artist", mbid: "art-1" });
  });

  it("sorts items within each section by score descending", () => {
    const inputs: RankInputs = {
      recordings: [
        {
          item: makeRecording({
            recordingMbid: "low",
            title: "Low Score",
            artistName: "Nobody",
            listenCount: null,
          }),
          lexScore: 10,
        },
        {
          item: makeRecording({
            recordingMbid: "high",
            title: "Lost Song",
            artistName: "Ocean",
            listenCount: 5_000_000,
          }),
          lexScore: 90,
        },
      ],
      artists: [],
      releases: [],
    };
    const result = rankUnified("lost song ocean", inputs);
    expect(result.recordings[0]!.recordingMbid).toBe("high");
    expect(result.recordings[1]!.recordingMbid).toBe("low");
  });

  it("topResult points at the highest-scoring recording when two recordings compete", () => {
    const inputs: RankInputs = {
      recordings: [
        {
          item: makeRecording({
            recordingMbid: "winner",
            title: "Exact Match",
            artistName: "Artist",
            listenCount: 1_000_000,
          }),
          lexScore: 100,
        },
        {
          item: makeRecording({
            recordingMbid: "loser",
            title: "No Match",
            artistName: "Nobody",
            listenCount: null,
          }),
          lexScore: 0,
        },
      ],
      artists: [],
      releases: [],
    };
    const result = rankUnified("exact match artist", inputs);
    expect(result.topResult).toEqual({ type: "recording", mbid: "winner" });
  });
});
