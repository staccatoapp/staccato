import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildHeardIndex } from "../profile/heard.js";
import type { AdjacencySet, TasteProfile } from "../profile/types.js";
import type { Candidate } from "../candidates/service.js";
import type { GeneratorContext } from "./types.js";
import {
  SOMETHING_NEW_ADJACENT_MAX,
  SOMETHING_NEW_PER_SOURCE_CAP,
  SOMETHING_NEW_TARGET_TRACKS,
  somethingNewGenerator,
} from "./something-new.js";

const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn() } as never;

function profile(adjacency: AdjacencySet): TasteProfile {
  return {
    userId: "user-1",
    genreAffinity: [],
    artistAffinity: [],
    albumAffinity: [],
    decadeAffinity: [],
    adjacency,
    heard: buildHeardIndex([]),
    computedAt: 0,
  };
}

function ctx(
  byTag: (tag: string) => Candidate[],
  byArtist: (artist: string) => Candidate[],
  heardMbids: string[] = [],
): GeneratorContext {
  return {
    candidateService: {
      popularTracksForTag: vi.fn(async (tag: string) => byTag(tag)),
      topTracksForArtist: vi.fn(async (artist: string) => byArtist(artist)),
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
  over: Partial<Candidate> & { popularityRank: number; mbid: string },
): Candidate {
  return { name: `T${over.mbid}`, artist: "X", ...over };
}

beforeEach(() => vi.clearAllMocks());

describe("somethingNewGenerator.isApplicable", () => {
  it("is true when adjacency has tags", () => {
    expect(
      somethingNewGenerator.isApplicable(
        profile({ tags: ["trap"], artists: [] }),
      ),
    ).toBe(true);
  });
  it("is true when adjacency has artists", () => {
    expect(
      somethingNewGenerator.isApplicable(
        profile({ tags: [], artists: ["J. Cole"] }),
      ),
    ).toBe(true);
  });
  it("is false when adjacency is empty (thin profile)", () => {
    expect(
      somethingNewGenerator.isApplicable(profile({ tags: [], artists: [] })),
    ).toBe(false);
  });
});

describe("somethingNewGenerator.generate", () => {
  it("sources from both adjacency axes and emits one combined mix", async () => {
    const c = ctx(
      (tag) => [
        cand({
          popularityRank: 0,
          mbid: `tag-${tag}`,
          name: `tag-${tag}`,
          artist: tag,
        }),
      ],
      (artist) => [
        cand({
          popularityRank: 0,
          mbid: `art-${artist}`,
          name: `art-${artist}`,
          artist,
        }),
      ],
    );
    const [spec] = await somethingNewGenerator.generate(
      profile({ tags: ["trap"], artists: ["J. Cole"] }),
      c,
    );
    expect(spec!.id).toBe("inhouse:something-new");
    expect(spec!.name).toBe("Something New");
    expect(spec!.candidates.map((x) => x.mbid).sort()).toEqual([
      "art-J. Cole",
      "tag-trap",
    ]);
    expect(c.candidateService.popularTracksForTag).toHaveBeenCalledWith("trap");
    expect(c.candidateService.topTracksForArtist).toHaveBeenCalledWith(
      "J. Cole",
    );
  });

  it("caps the tag axis at SOMETHING_NEW_ADJACENT_MAX sources", async () => {
    const tags = Array.from(
      { length: SOMETHING_NEW_ADJACENT_MAX + 3 },
      (_, i) => `t${i}`,
    );
    const c = ctx(
      (tag) => [
        cand({ popularityRank: 0, mbid: `m-${tag}`, name: tag, artist: tag }),
      ],
      () => [],
    );
    await somethingNewGenerator.generate(profile({ tags, artists: [] }), c);
    expect(
      (c.candidateService.popularTracksForTag as ReturnType<typeof vi.fn>).mock
        .calls.length,
    ).toBe(SOMETHING_NEW_ADJACENT_MAX);
  });

  it("caps the artist axis at SOMETHING_NEW_ADJACENT_MAX sources", async () => {
    const artists = Array.from(
      { length: SOMETHING_NEW_ADJACENT_MAX + 3 },
      (_, i) => `Artist ${i}`,
    );
    const c = ctx(
      () => [],
      (artist) => [
        cand({ popularityRank: 0, mbid: `m-${artist}`, name: artist, artist }),
      ],
    );
    await somethingNewGenerator.generate(profile({ tags: [], artists }), c);
    expect(
      (c.candidateService.topTracksForArtist as ReturnType<typeof vi.fn>).mock
        .calls.length,
    ).toBe(SOMETHING_NEW_ADJACENT_MAX);
  });

  it("hard-excludes heard tracks (discovery must be new)", async () => {
    const c = ctx(
      () => [
        cand({ popularityRank: 0, mbid: "heard", name: "a", artist: "A" }),
        cand({ popularityRank: 1, mbid: "fresh", name: "b", artist: "B" }),
      ],
      () => [],
      ["heard"],
    );
    const [spec] = await somethingNewGenerator.generate(
      profile({ tags: ["trap"], artists: [] }),
      c,
    );
    expect(spec!.candidates.map((x) => x.mbid)).toEqual(["fresh"]);
  });

  it("caps the mix at SOMETHING_NEW_TARGET_TRACKS", async () => {
    // 4 tags (ADJACENT_MAX) × SOMETHING_NEW_PER_SOURCE_CAP (8) = 32 distinct
    // candidates available, more than the 25-track target, so the cap binds.
    // (2 tags would yield 2×8=16 < 25 and the target cap wouldn't bind.)
    const c = ctx(
      (tag) =>
        Array.from({ length: 30 }, (_, i) =>
          cand({
            popularityRank: i,
            mbid: `${tag}-${i}`,
            name: `${tag}-${i}`,
            artist: tag,
          }),
        ),
      () => [],
    );
    const [spec] = await somethingNewGenerator.generate(
      profile({ tags: ["trap", "grime", "dubstep", "house"], artists: [] }),
      c,
    );
    expect(spec!.candidates).toHaveLength(SOMETHING_NEW_TARGET_TRACKS);
  });

  it("returns [] when adjacency yields no candidates", async () => {
    const c = ctx(
      () => [],
      () => [],
    );
    expect(
      await somethingNewGenerator.generate(
        profile({ tags: ["trap"], artists: ["J. Cole"] }),
        c,
      ),
    ).toEqual([]);
  });

  it("per-source cap: a single tag yielding more candidates than the cap is sliced to SOMETHING_NEW_PER_SOURCE_CAP", async () => {
    // SOMETHING_NEW_TARGET_TRACKS (25) > SOMETHING_NEW_PER_SOURCE_CAP (8), so
    // with one source the per-source slice is the binding constraint.
    const c = ctx(
      () =>
        Array.from({ length: SOMETHING_NEW_PER_SOURCE_CAP + 5 }, (_, i) =>
          cand({
            popularityRank: i,
            mbid: `m-${i}`,
            name: `n-${i}`,
            artist: "A",
          }),
        ),
      () => [],
    );
    const [spec] = await somethingNewGenerator.generate(
      profile({ tags: ["trap"], artists: [] }),
      c,
    );
    expect(spec!.candidates).toHaveLength(SOMETHING_NEW_PER_SOURCE_CAP);
  });
});
