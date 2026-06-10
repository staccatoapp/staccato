import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildHeardIndex } from "../profile/heard.js";
import type { GenreAffinity, TasteProfile } from "../profile/types.js";
import type { Candidate } from "../candidates/service.js";
import type { GeneratorContext } from "./types.js";
import {
  GENRE_MIX_MAX_GENRES,
  GENRE_MIX_TARGET_TRACKS,
  genreMixGenerator,
} from "./genre-mix.js";

const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn() } as never;

function profile(genreAffinity: GenreAffinity[]): TasteProfile {
  return {
    userId: "user-1",
    genreAffinity,
    artistAffinity: [],
    albumAffinity: [],
    decadeAffinity: [],
    adjacency: { tags: [], artists: [] },
    heard: buildHeardIndex([]),
    computedAt: 0,
  };
}

function ctx(
  popular: (tag: string) => Candidate[],
  heardMbids: string[] = [],
): GeneratorContext {
  return {
    candidateService: {
      popularTracksForTag: vi.fn(async (tag: string) => popular(tag)),
      topTracksForArtist: vi.fn(async () => []),
    },
    heard: buildHeardIndex(
      heardMbids.map((mbid) => ({
        recordingMbid: mbid,
        playCount: 1,
        lastListenedAtMs: 0,
      })),
    ),
    log,
  };
}

function cand(
  over: Partial<Candidate> & { popularityRank: number },
): Candidate {
  return {
    name: `Track ${over.popularityRank}`,
    artist: "Artist",
    mbid: `mbid-${over.popularityRank}`,
    ...over,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("genreMixGenerator.isApplicable", () => {
  it("is true when a genre has enough recency-decayed breadth", () => {
    expect(
      genreMixGenerator.isApplicable(
        profile([{ genre: "hip-hop", weight: 1, effectiveRecentTracks: 5 }]),
      ),
    ).toBe(true);
  });

  it("is false when every genre is below the breadth floor (stale / single-track)", () => {
    // e.g. a genre abandoned 2 years ago, or one obsessive track ≈ 1.
    expect(
      genreMixGenerator.isApplicable(
        profile([
          { genre: "hip-hop", weight: 0.9, effectiveRecentTracks: 0.01 },
          { genre: "jazz", weight: 0.1, effectiveRecentTracks: 1 },
        ]),
      ),
    ).toBe(false);
  });

  it("is false for an empty profile (cold start)", () => {
    expect(genreMixGenerator.isApplicable(profile([]))).toBe(false);
  });
});

describe("genreMixGenerator.generate", () => {
  it("selects the top qualifying genres by weight, capped at GENRE_MIX_MAX_GENRES", async () => {
    const affinities: GenreAffinity[] = [
      { genre: "g1", weight: 0.4, effectiveRecentTracks: 10 },
      { genre: "g2", weight: 0.3, effectiveRecentTracks: 10 },
      { genre: "low", weight: 0.2, effectiveRecentTracks: 0.5 }, // below floor
      { genre: "g3", weight: 0.05, effectiveRecentTracks: 10 },
      { genre: "g4", weight: 0.05, effectiveRecentTracks: 10 },
    ];
    const c = ctx(() => [cand({ popularityRank: 0 })]);

    const specs = await genreMixGenerator.generate(profile(affinities), c);

    expect(specs).toHaveLength(GENRE_MIX_MAX_GENRES);
    const genres = (
      c.candidateService.popularTracksForTag as ReturnType<typeof vi.fn>
    ).mock.calls.map((call) => call[0]);
    expect(genres).toEqual(["g1", "g2", "g3"]); // "low" skipped, g4 over cap
  });

  it("namespaces the id and builds name/description from the genre", async () => {
    const c = ctx(() => [cand({ popularityRank: 0 })]);
    const [spec] = await genreMixGenerator.generate(
      profile([{ genre: "hip-hop", weight: 1, effectiveRecentTracks: 5 }]),
      c,
    );
    expect(spec!.id).toBe("inhouse:genre:hip-hop");
    expect(spec!.name).toBe("Hip-hop Mix");
    expect(spec!.description).toBe("Popular hip-hop tracks picked for you.");
  });

  it("down-weights heard tracks, sinking them behind unheard while preserving popularity order", async () => {
    const candidates = [
      cand({ popularityRank: 0, mbid: "heard-A" }),
      cand({ popularityRank: 1, mbid: "fresh-A" }),
      cand({ popularityRank: 2, mbid: "heard-B" }),
      cand({ popularityRank: 3, mbid: "fresh-B" }),
      cand({ popularityRank: 4, mbid: null }), // mbid-less = treated as unheard
    ];
    const c = ctx(() => candidates, ["heard-A", "heard-B"]);

    const [spec] = await genreMixGenerator.generate(
      profile([{ genre: "g", weight: 1, effectiveRecentTracks: 5 }]),
      c,
    );

    expect(spec!.candidates.map((x) => x.mbid)).toEqual([
      "fresh-A",
      "fresh-B",
      null,
      "heard-A",
      "heard-B",
    ]);
  });

  it("caps each playlist at GENRE_MIX_TARGET_TRACKS", async () => {
    const many = Array.from({ length: 60 }, (_, i) =>
      cand({ popularityRank: i, mbid: `m-${i}` }),
    );
    const c = ctx(() => many);

    const [spec] = await genreMixGenerator.generate(
      profile([{ genre: "g", weight: 1, effectiveRecentTracks: 5 }]),
      c,
    );

    expect(spec!.candidates).toHaveLength(GENRE_MIX_TARGET_TRACKS);
  });

  it("skips a genre that yields no candidates", async () => {
    const c = ctx((tag) => (tag === "g1" ? [] : [cand({ popularityRank: 0 })]));
    const specs = await genreMixGenerator.generate(
      profile([
        { genre: "g1", weight: 0.6, effectiveRecentTracks: 5 },
        { genre: "g2", weight: 0.4, effectiveRecentTracks: 5 },
      ]),
      c,
    );
    expect(specs.map((s) => s.id)).toEqual(["inhouse:genre:g2"]);
  });

  it("returns [] for a cold-start profile (nothing qualifies)", async () => {
    const c = ctx(() => [cand({ popularityRank: 0 })]);
    expect(await genreMixGenerator.generate(profile([]), c)).toEqual([]);
  });
});
