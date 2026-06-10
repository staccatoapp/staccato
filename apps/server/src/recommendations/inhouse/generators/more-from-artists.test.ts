import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildHeardIndex } from "../profile/heard.js";
import type { ArtistAffinity, TasteProfile } from "../profile/types.js";
import type { Candidate } from "../candidates/service.js";
import type { GeneratorContext } from "./types.js";
import {
  ARTISTS_MAX,
  ARTISTS_MIN_RECENT,
  ARTISTS_PER_SOURCE_CAP,
  ARTISTS_TARGET_TRACKS,
  moreFromArtistsGenerator,
} from "./more-from-artists.js";

const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn() } as never;

function profile(artistAffinity: ArtistAffinity[]): TasteProfile {
  return {
    userId: "user-1",
    genreAffinity: [],
    artistAffinity,
    albumAffinity: [],
    decadeAffinity: [],
    adjacency: { tags: [], artists: [] },
    heard: buildHeardIndex([]),
    computedAt: 0,
  };
}

function ctx(
  topTracks: (artist: string, mbid?: string | null) => Candidate[],
  heardMbids: string[] = [],
): GeneratorContext {
  return {
    candidateService: {
      popularTracksForTag: vi.fn(async () => []),
      topTracksForArtist: vi.fn(async (a: string, m?: string | null) =>
        topTracks(a, m),
      ),
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

function aff(
  over: Partial<ArtistAffinity> & { artistName: string },
): ArtistAffinity {
  return {
    artistMbid: null,
    weight: 0.5,
    effectiveRecentTracks: 5,
    ...over,
  };
}

function cand(
  over: Partial<Candidate> & { popularityRank: number; mbid: string },
): Candidate {
  return { name: `T${over.mbid}`, artist: "X", ...over };
}

beforeEach(() => vi.clearAllMocks());

describe("moreFromArtistsGenerator.isApplicable", () => {
  it("is true when an artist has enough recent breadth", () => {
    expect(
      moreFromArtistsGenerator.isApplicable(
        profile([
          aff({ artistName: "A", effectiveRecentTracks: ARTISTS_MIN_RECENT }),
        ]),
      ),
    ).toBe(true);
  });

  it("is false when every artist is below the breadth floor", () => {
    expect(
      moreFromArtistsGenerator.isApplicable(
        profile([aff({ artistName: "A", effectiveRecentTracks: 1 })]),
      ),
    ).toBe(false);
  });

  it("is false for a cold-start profile", () => {
    expect(moreFromArtistsGenerator.isApplicable(profile([]))).toBe(false);
  });
});

describe("moreFromArtistsGenerator.generate", () => {
  it("emits one combined mix addressing each qualifying artist by mbid when present", async () => {
    const c = ctx((artist) =>
      artist === "A"
        ? [cand({ popularityRank: 0, mbid: "a0", artist: "A" })]
        : [cand({ popularityRank: 0, mbid: "b0", artist: "B" })],
    );
    const [spec] = await moreFromArtistsGenerator.generate(
      profile([
        aff({ artistName: "A", artistMbid: "A-mbid", weight: 0.6 }),
        aff({ artistName: "B", artistMbid: null, weight: 0.4 }),
      ]),
      c,
    );
    expect(spec!.id).toBe("inhouse:artists");
    expect(spec!.name).toBe("Artists You Love");
    const calls = (
      c.candidateService.topTracksForArtist as ReturnType<typeof vi.fn>
    ).mock.calls;
    expect(calls).toContainEqual(["A", "A-mbid"]);
    expect(calls).toContainEqual(["B", null]);
    expect(spec!.candidates.map((x) => x.mbid).sort()).toEqual(["a0", "b0"]);
  });

  it("takes at most ARTISTS_MAX qualifying artists by weight", async () => {
    const affinities = Array.from({ length: ARTISTS_MAX + 2 }, (_, i) =>
      aff({ artistName: `A${i}`, weight: 1 - i * 0.01 }),
    );
    const c = ctx((artist) => [
      cand({ popularityRank: 0, mbid: `m-${artist}`, artist }),
    ]);
    await moreFromArtistsGenerator.generate(profile(affinities), c);
    expect(
      (c.candidateService.topTracksForArtist as ReturnType<typeof vi.fn>).mock
        .calls.length,
    ).toBe(ARTISTS_MAX);
  });

  it("hard-excludes heard tracks (discovery)", async () => {
    const c = ctx(
      () => [
        cand({ popularityRank: 0, mbid: "heard", artist: "A", name: "n1" }),
        cand({ popularityRank: 1, mbid: "fresh", artist: "A", name: "n2" }),
      ],
      ["heard"],
    );
    const [spec] = await moreFromArtistsGenerator.generate(
      profile([aff({ artistName: "A" })]),
      c,
    );
    expect(spec!.candidates.map((x) => x.mbid)).toEqual(["fresh"]);
  });

  it("caps the mix at ARTISTS_TARGET_TRACKS", async () => {
    // 3 artists × ARTISTS_PER_SOURCE_CAP (10) = 30 distinct candidates available,
    // more than the 25-track target, so the cap is what bounds the result.
    const c = ctx((artist) =>
      Array.from({ length: 30 }, (_, i) =>
        cand({
          popularityRank: i,
          mbid: `${artist}-${i}`,
          artist,
          name: `${artist}-${i}`,
        }),
      ),
    );
    const [spec] = await moreFromArtistsGenerator.generate(
      profile([
        aff({ artistName: "A", weight: 0.5 }),
        aff({ artistName: "B", weight: 0.3 }),
        aff({ artistName: "C", weight: 0.2 }),
      ]),
      c,
    );
    expect(spec!.candidates).toHaveLength(ARTISTS_TARGET_TRACKS);
  });

  it("caps each artist's contribution at ARTISTS_PER_SOURCE_CAP before blending", async () => {
    // One artist yielding more than the per-source cap; target is large enough not
    // to bind, so the per-source slice is what bounds the result.
    const c = ctx(() =>
      Array.from({ length: ARTISTS_PER_SOURCE_CAP + 5 }, (_, i) =>
        cand({ popularityRank: i, mbid: `m-${i}`, name: `n-${i}` }),
      ),
    );
    const [spec] = await moreFromArtistsGenerator.generate(
      profile([aff({ artistName: "A" })]),
      c,
    );
    expect(spec!.candidates).toHaveLength(ARTISTS_PER_SOURCE_CAP);
  });

  it("returns [] when nothing qualifies (cold start)", async () => {
    const c = ctx(() => [cand({ popularityRank: 0, mbid: "x" })]);
    expect(await moreFromArtistsGenerator.generate(profile([]), c)).toEqual([]);
  });

  it("returns [] when qualifying artists yield no candidates", async () => {
    const c = ctx(() => []);
    expect(
      await moreFromArtistsGenerator.generate(
        profile([aff({ artistName: "A" })]),
        c,
      ),
    ).toEqual([]);
  });
});
