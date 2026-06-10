import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../db/queries/playlists.js", () => ({
  getPlaylistTracksForSeeding: vi.fn(),
}));
vi.mock("./similarity.js", () => ({ aggregateSimilar: vi.fn() }));
vi.mock("../inhouse/resolution/resolve.js", () => ({
  resolveCandidates: vi.fn(),
  candidateNameKey: (artist: string, title: string) =>
    `${artist.toLowerCase()} ${title.toLowerCase()}`,
}));

import { getPlaylistTracksForSeeding } from "../../db/queries/playlists.js";
import { aggregateSimilar } from "./similarity.js";
import { resolveCandidates } from "../inhouse/resolution/resolve.js";
import { computeSuggestions } from "./compute.js";
import { logger } from "../../logger.js";

const log = logger.child({ test: true });
const mockSeed = vi.mocked(getPlaylistTracksForSeeding);
const mockAgg = vi.mocked(aggregateSimilar);
const mockResolve = vi.mocked(resolveCandidates);

beforeEach(() => vi.clearAllMocks());

function seedRow(title: string) {
  return {
    trackId: title,
    title,
    artistName: "A",
    recordingMbid: null,
    artistMbid: null,
    addedAt: new Date(),
  };
}

describe("computeSuggestions", () => {
  it("returns [] on cold-start (below MIN_SEEDS)", async () => {
    mockSeed.mockReturnValue([seedRow("a"), seedRow("b")]);
    const out = await computeSuggestions("p1", log);
    expect(out).toEqual([]);
    expect(mockAgg).not.toHaveBeenCalled();
  });

  it("resolves ranked candidates and preserves rank order", async () => {
    mockSeed.mockReturnValue([seedRow("a"), seedRow("b"), seedRow("c")]);
    mockAgg.mockResolvedValue([
      { name: "One", artist: "A", mbid: null, popularityRank: 0 },
      { name: "Two", artist: "A", mbid: null, popularityRank: 1 },
    ]);
    const map = new Map([
      [
        "a one",
        {
          recordingMbid: "m1",
          title: "One",
          artistName: "A",
          artistMbid: null,
          albumTitle: null,
          releaseGroupMbid: null,
          durationMs: null,
          coverArtUrl: null,
          inLibrary: false,
          localTrackId: null,
        },
      ],
      // "Two" intentionally unresolved → dropped
    ]);
    mockResolve.mockResolvedValue(map);
    const out = await computeSuggestions("p1", log);
    expect(out.map((t) => t.title)).toEqual(["One"]);
  });

  it("returns [] when aggregation yields nothing", async () => {
    mockSeed.mockReturnValue([seedRow("a"), seedRow("b"), seedRow("c")]);
    mockAgg.mockResolvedValue([]);
    const out = await computeSuggestions("p1", log);
    expect(out).toEqual([]);
    expect(mockResolve).not.toHaveBeenCalled();
  });
});
