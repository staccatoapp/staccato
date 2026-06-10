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

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

function aggFixture(
  over: Partial<
    import("../../../../db/queries/listening-history.js").ListenAggregate
  >,
) {
  return {
    trackId: "t",
    recordingMbid: "mbid",
    title: "Song",
    artistName: "Artist",
    artistMbid: "a-mbid",
    albumId: null,
    albumTitle: null,
    releaseGroupMbid: null,
    releaseYear: null,
    playCount: 1,
    lastListenedAtMs: now,
    ...over,
  };
}

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
      effectiveRecentTracks: 1,
    });
    expect(profile.decadeAffinity?.[0]).toEqual({
      decade: 2000,
      weight: 1,
      effectiveRecentTracks: 1,
    });
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

describe("effectiveRecentTracks (gate metric)", () => {
  it("sums recency-decayed contributions over DISTINCT tracks (≈ track count when all fresh)", async () => {
    mAgg.mockReturnValue([
      aggFixture({ trackId: "t1", recordingMbid: "m1", lastListenedAtMs: now }),
      aggFixture({ trackId: "t2", recordingMbid: "m2", lastListenedAtMs: now }),
    ]);
    mTags.mockResolvedValue([{ name: "hip-hop", weight: 100 }]);

    const profile = await listeningHistoryExtractor.extract("user-1", ctx);
    const hipHop = profile.genreAffinity?.find((g) => g.genre === "hip-hop");
    expect(hipHop?.effectiveRecentTracks).toBeCloseTo(2, 5);
  });

  it("does not let one obsessively-repeated track inflate breadth (≈ 1 for 50 plays)", async () => {
    mAgg.mockReturnValue([
      aggFixture({
        trackId: "t1",
        recordingMbid: "m1",
        playCount: 50,
        lastListenedAtMs: now,
      }),
    ]);
    mTags.mockResolvedValue([{ name: "hip-hop", weight: 100 }]);

    const profile = await listeningHistoryExtractor.extract("user-1", ctx);
    const hipHop = profile.genreAffinity?.find((g) => g.genre === "hip-hop");
    expect(hipHop?.effectiveRecentTracks).toBeCloseTo(1, 5);
  });

  it("decays an abandoned genre toward zero (tracks last heard ~2 years ago)", async () => {
    const twoYearsAgo = now - 2 * ONE_YEAR_MS;
    mAgg.mockReturnValue([
      aggFixture({
        trackId: "t1",
        recordingMbid: "m1",
        lastListenedAtMs: twoYearsAgo,
      }),
      aggFixture({
        trackId: "t2",
        recordingMbid: "m2",
        lastListenedAtMs: twoYearsAgo,
      }),
    ]);
    mTags.mockResolvedValue([{ name: "hip-hop", weight: 100 }]);

    const profile = await listeningHistoryExtractor.extract("user-1", ctx);
    const hipHop = profile.genreAffinity?.find((g) => g.genre === "hip-hop");
    expect(hipHop?.effectiveRecentTracks ?? 0).toBeLessThan(0.001);
  });
});

describe("effectiveRecentTracks for artist / decade / album", () => {
  it("sums recency-decayed distinct tracks per artist and decade (fresh ≈ count)", async () => {
    mAgg.mockReturnValue([
      aggFixture({
        trackId: "t1",
        recordingMbid: "m1",
        title: "Song A",
        artistName: "Artist A",
        albumId: "al1",
        albumTitle: "Album A",
        releaseGroupMbid: "rg1",
        releaseYear: 2005,
        playCount: 3,
      }),
      aggFixture({
        trackId: "t2",
        recordingMbid: "m2",
        title: "Song B",
        artistName: "Artist A",
        albumId: "al1",
        albumTitle: "Album A",
        releaseGroupMbid: "rg1",
        releaseYear: 2008,
      }),
    ]);
    mTags.mockResolvedValue([{ name: "hip-hop", weight: 100 }]);

    const profile = await listeningHistoryExtractor.extract("user-1", ctx);

    // Two distinct fresh tracks by one artist → artist breadth ≈ 2.
    expect(profile.artistAffinity?.[0]!.artistName).toBe("Artist A");
    expect(profile.artistAffinity?.[0]!.effectiveRecentTracks).toBeCloseTo(
      2,
      5,
    );
    // Both fall in the 2000s decade → decade breadth ≈ 2.
    expect(profile.decadeAffinity?.[0]).toMatchObject({ decade: 2000 });
    expect(profile.decadeAffinity?.[0]!.effectiveRecentTracks).toBeCloseTo(
      2,
      5,
    );
    // Two distinct tracks on one album → album breadth ≈ 2 (computed, unused).
    expect(profile.albumAffinity?.[0]!.effectiveRecentTracks).toBeCloseTo(2, 5);
  });

  it("does not let one obsessively-repeated track inflate artist/decade breadth (≈ 1 for 50 plays)", async () => {
    mAgg.mockReturnValue([
      aggFixture({
        trackId: "t1",
        recordingMbid: "m1",
        title: "Song A",
        artistName: "Artist A",
        releaseYear: 2001,
        playCount: 50,
      }),
    ]);
    mTags.mockResolvedValue([{ name: "hip-hop", weight: 100 }]);

    const profile = await listeningHistoryExtractor.extract("user-1", ctx);
    expect(profile.artistAffinity?.[0]!.effectiveRecentTracks).toBeCloseTo(
      1,
      5,
    );
    expect(profile.decadeAffinity?.[0]!.effectiveRecentTracks).toBeCloseTo(
      1,
      5,
    );
  });

  it("decays an abandoned artist/decade toward zero (~2 years ago)", async () => {
    const twoYearsAgo = now - 2 * ONE_YEAR_MS;
    mAgg.mockReturnValue([
      aggFixture({
        trackId: "t1",
        recordingMbid: "m1",
        title: "Song A",
        artistName: "Artist A",
        releaseYear: 1995,
        lastListenedAtMs: twoYearsAgo,
      }),
    ]);
    mTags.mockResolvedValue([{ name: "hip-hop", weight: 100 }]);

    const profile = await listeningHistoryExtractor.extract("user-1", ctx);
    expect(
      profile.artistAffinity?.[0]!.effectiveRecentTracks ?? 0,
    ).toBeLessThan(0.001);
    expect(
      profile.decadeAffinity?.[0]!.effectiveRecentTracks ?? 0,
    ).toBeLessThan(0.001);
  });

  it("decays an abandoned album toward zero (tracks last heard ~2 years ago)", async () => {
    const twoYearsAgo = now - 2 * ONE_YEAR_MS;
    mAgg.mockReturnValue([
      aggFixture({
        trackId: "t1",
        recordingMbid: "m1",
        albumId: "al1",
        albumTitle: "Album A",
        lastListenedAtMs: twoYearsAgo,
      }),
      aggFixture({
        trackId: "t2",
        recordingMbid: "m2",
        albumId: "al1",
        albumTitle: "Album A",
        lastListenedAtMs: twoYearsAgo,
      }),
    ]);
    mTags.mockResolvedValue([{ name: "hip-hop", weight: 100 }]);

    const profile = await listeningHistoryExtractor.extract("user-1", ctx);
    expect(profile.albumAffinity?.[0]!.effectiveRecentTracks ?? 0).toBeLessThan(
      0.001,
    );
  });
});
