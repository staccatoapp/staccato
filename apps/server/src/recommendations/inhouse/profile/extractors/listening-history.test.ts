import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../db/queries/listening-history.js", () => ({
  getListenAggregatesForUser: vi.fn(),
}));
vi.mock("../../../../lastfm/tag-cache.js", () => ({ getTagsCached: vi.fn() }));
vi.mock("../../../../lastfm/client.js", () => ({
  getSimilarTags: vi.fn(),
  getSimilarArtists: vi.fn(),
}));

import { getListenAggregatesForUser } from "../../../../db/queries/listening-history.js";
import { getTagsCached } from "../../../../lastfm/tag-cache.js";
import {
  getSimilarArtists,
  getSimilarTags,
} from "../../../../lastfm/client.js";
import { listeningHistoryExtractor } from "./listening-history.js";

const mAgg = vi.mocked(getListenAggregatesForUser);
const mTags = vi.mocked(getTagsCached);
const mSimTags = vi.mocked(getSimilarTags);
const mSimArtists = vi.mocked(getSimilarArtists);

const now = 1_000_000_000_000;
const ctx = {
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn() } as never,
  now,
};

beforeEach(() => {
  vi.clearAllMocks();
  mSimTags.mockResolvedValue([]);
  mSimArtists.mockResolvedValue([]);
});

describe("listeningHistoryExtractor", () => {
  it("produces a normalised genre affinity weighted by plays × recency", async () => {
    mAgg.mockReturnValue([
      {
        trackId: "t1",
        recordingMbid: "mbid-1",
        title: "Song A",
        artistName: "Artist A",
        artistMbid: "a-mbid",
        albumId: "al1",
        albumTitle: "Album A",
        releaseGroupMbid: "rg1",
        releaseYear: 2005,
        playCount: 4,
        lastListenedAtMs: now,
      },
    ]);
    // track-level hip-hop tag for that one track
    mTags.mockResolvedValue([{ name: "hip-hop", weight: 100 }]);

    const profile = await listeningHistoryExtractor.extract("user-1", ctx);

    expect(profile.genreAffinity?.[0]).toEqual({
      genre: "hip-hop",
      weight: 1,
    });
    expect(profile.decadeAffinity?.[0]).toEqual({ decade: 2000, weight: 1 });
    expect(profile.artistAffinity?.[0]!.artistName).toBe("Artist A");
    expect(profile.heard?.isHeard("mbid-1")).toBe(true);
  });

  it("excludes a top affinity's own tags/artists from the adjacency set", async () => {
    mAgg.mockReturnValue([
      {
        trackId: "t1",
        recordingMbid: "mbid-1",
        title: "Song A",
        artistName: "Artist A",
        artistMbid: "a-mbid",
        albumId: null,
        albumTitle: null,
        releaseGroupMbid: null,
        releaseYear: null,
        playCount: 1,
        lastListenedAtMs: now,
      },
    ]);
    mTags.mockResolvedValue([{ name: "rock", weight: 100 }]);
    // similar tags include the seed genre "rock" plus a neighbour "punk"
    mSimTags.mockResolvedValue(["rock", "punk"]);
    mSimArtists.mockResolvedValue(["Artist A", "Neighbour"]);

    const profile = await listeningHistoryExtractor.extract("user-1", ctx);

    expect(profile.adjacency?.tags).toContain("punk");
    expect(profile.adjacency?.tags).not.toContain("rock"); // seed excluded
    expect(profile.adjacency?.artists).toContain("Neighbour");
    expect(profile.adjacency?.artists).not.toContain("Artist A");
  });

  it("returns empty affinities for a user with no history", async () => {
    mAgg.mockReturnValue([]);
    const profile = await listeningHistoryExtractor.extract("user-1", ctx);
    expect(profile.genreAffinity).toEqual([]);
    expect(profile.artistAffinity).toEqual([]);
    expect(profile.heard?.size).toBe(0);
  });
});
