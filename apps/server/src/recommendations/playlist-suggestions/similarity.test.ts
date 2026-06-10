import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lastfm/client.js", () => ({ getSimilarTracks: vi.fn() }));

import { getSimilarTracks } from "../../lastfm/client.js";
import { aggregateSimilar } from "./similarity.js";
import { PER_SEED_CAP } from "./constants.js";
import { logger } from "../../logger.js";

const mockSimilar = vi.mocked(getSimilarTracks);
const log = logger.child({ test: true });

beforeEach(() => vi.clearAllMocks());

describe("aggregateSimilar", () => {
  it("addresses each seed by artist+title only", async () => {
    // Last.fm's track.getSimilar index has poor per-recording-MBID coverage
    // (error 6 / empty results), so seeds are addressed by name — the Seed type
    // carries no MBID, mirroring the resolution layer's "don't trust Last.fm
    // MBIDs" stance (decision E4). The call must pass exactly { artist, title }.
    mockSimilar.mockResolvedValue([]);
    await aggregateSimilar([{ title: "s1", artist: "x" }], [], log);
    expect(mockSimilar).toHaveBeenCalledWith(
      { artist: "x", title: "s1" },
      PER_SEED_CAP,
    );
  });

  it("ranks by overlap (more seeds → higher), then scoreSum", async () => {
    // seed1 → [A, B]; seed2 → [A, C]  ⇒ A overlap 2, B/C overlap 1
    mockSimilar
      .mockResolvedValueOnce([
        { name: "A", artist: "ar", mbid: "a", matchScore: 0.5 },
        { name: "B", artist: "ar", mbid: "b", matchScore: 0.9 },
      ])
      .mockResolvedValueOnce([
        { name: "A", artist: "ar", mbid: "a", matchScore: 0.5 },
        { name: "C", artist: "ar", mbid: "c", matchScore: 0.4 },
      ]);
    const out = await aggregateSimilar(
      [
        { title: "s1", artist: "x" },
        { title: "s2", artist: "y" },
      ],
      [],
      log,
    );
    expect(out.map((c) => c.name)).toEqual(["A", "B", "C"]);
    expect(out[0]).toMatchObject({ name: "A", popularityRank: 0 });
  });

  it("excludes tracks already in the playlist by mbid and by name", async () => {
    mockSimilar.mockResolvedValueOnce([
      { name: "Owned", artist: "ar", mbid: "owned-mbid", matchScore: 1 },
      { name: "ByName", artist: "AR", mbid: "x", matchScore: 0.8 },
      { name: "Keep", artist: "ar", mbid: "k", matchScore: 0.7 },
    ]);
    const out = await aggregateSimilar(
      [{ title: "s1", artist: "x" }],
      [
        { recordingMbid: "owned-mbid", artist: "zzz", title: "zzz" },
        { recordingMbid: null, artist: "ar", title: "ByName" },
      ],
      log,
    );
    expect(out.map((c) => c.name)).toEqual(["Keep"]);
  });

  it("counts a candidate once per seed even if the seed lists it twice", async () => {
    mockSimilar.mockResolvedValueOnce([
      { name: "A", artist: "ar", mbid: "a", matchScore: 0.5 },
      { name: "A", artist: "ar", mbid: "a", matchScore: 0.5 },
    ]);
    const out = await aggregateSimilar([{ title: "s1", artist: "x" }], [], log);
    expect(out).toHaveLength(1);
  });
});
