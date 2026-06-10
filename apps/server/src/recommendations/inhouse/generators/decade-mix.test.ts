import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildHeardIndex } from "../profile/heard.js";
import type { DecadeAffinity, TasteProfile } from "../profile/types.js";
import type { Candidate } from "../candidates/service.js";
import type { GeneratorContext } from "./types.js";
import {
  DECADE_MIX_MIN_RECENT,
  DECADE_MIX_TARGET_TRACKS,
  decadeMixGenerator,
} from "./decade-mix.js";

const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn() } as never;

function profile(decadeAffinity: DecadeAffinity[]): TasteProfile {
  return {
    userId: "user-1",
    genreAffinity: [],
    artistAffinity: [],
    albumAffinity: [],
    decadeAffinity,
    adjacency: { tags: [], artists: [] },
    heard: buildHeardIndex([]),
    computedAt: 0,
  };
}

function ctx(
  byTag: (tag: string) => Candidate[],
  heardMbids: string[] = [],
): GeneratorContext {
  return {
    candidateService: {
      popularTracksForTag: vi.fn(async (tag: string) => byTag(tag)),
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
  over: Partial<Candidate> & { popularityRank: number; mbid: string | null },
): Candidate {
  return { name: `T${over.popularityRank}`, artist: "X", ...over };
}

beforeEach(() => vi.clearAllMocks());

describe("decadeMixGenerator.isApplicable", () => {
  it("is true when the dominant decade has enough recent breadth", () => {
    expect(
      decadeMixGenerator.isApplicable(
        profile([
          {
            decade: 2000,
            weight: 0.7,
            effectiveRecentTracks: DECADE_MIX_MIN_RECENT,
          },
          { decade: 1990, weight: 0.3, effectiveRecentTracks: 100 },
        ]),
      ),
    ).toBe(true);
  });

  it("is false when the dominant decade is below the breadth floor", () => {
    // The dominant decade (by weight) is gated, even if a lesser decade qualifies.
    expect(
      decadeMixGenerator.isApplicable(
        profile([
          { decade: 2000, weight: 0.7, effectiveRecentTracks: 1 },
          { decade: 1990, weight: 0.3, effectiveRecentTracks: 100 },
        ]),
      ),
    ).toBe(false);
  });

  it("is false for a cold-start profile", () => {
    expect(decadeMixGenerator.isApplicable(profile([]))).toBe(false);
  });
});

describe("decadeMixGenerator.generate", () => {
  it("builds the '<decade>s' tag and names the playlist from the dominant decade", async () => {
    const c = ctx(() => [cand({ popularityRank: 0, mbid: "m0" })]);
    const [spec] = await decadeMixGenerator.generate(
      profile([{ decade: 2000, weight: 1, effectiveRecentTracks: 5 }]),
      c,
    );
    expect(c.candidateService.popularTracksForTag).toHaveBeenCalledWith(
      "2000s",
    );
    expect(spec!.id).toBe("inhouse:decade:2000");
    expect(spec!.name).toBe("2000s Mix");
  });

  it("down-weights heard tracks (radio feel), sinking them behind unheard", async () => {
    const c = ctx(
      () => [
        cand({ popularityRank: 0, mbid: "heard", name: "a" }),
        cand({ popularityRank: 1, mbid: "fresh", name: "b" }),
        cand({ popularityRank: 2, mbid: null, name: "c" }),
      ],
      ["heard"],
    );
    const [spec] = await decadeMixGenerator.generate(
      profile([{ decade: 1990, weight: 1, effectiveRecentTracks: 5 }]),
      c,
    );
    expect(spec!.candidates.map((x) => x.mbid)).toEqual([
      "fresh",
      null,
      "heard",
    ]);
  });

  it("caps the mix at DECADE_MIX_TARGET_TRACKS", async () => {
    const c = ctx(() =>
      Array.from({ length: 40 }, (_, i) =>
        cand({ popularityRank: i, mbid: `m-${i}`, name: `n-${i}` }),
      ),
    );
    const [spec] = await decadeMixGenerator.generate(
      profile([{ decade: 2010, weight: 1, effectiveRecentTracks: 5 }]),
      c,
    );
    expect(spec!.candidates).toHaveLength(DECADE_MIX_TARGET_TRACKS);
  });

  it("returns [] when the tag yields no candidates", async () => {
    const c = ctx(() => []);
    expect(
      await decadeMixGenerator.generate(
        profile([{ decade: 2000, weight: 1, effectiveRecentTracks: 5 }]),
        c,
      ),
    ).toEqual([]);
  });

  it("returns [] for a cold-start profile", async () => {
    const c = ctx(() => [cand({ popularityRank: 0, mbid: "m" })]);
    expect(await decadeMixGenerator.generate(profile([]), c)).toEqual([]);
  });
});
