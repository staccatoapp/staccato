import { describe, expect, it } from "vitest";
import { buildHeardIndex } from "../profile/heard.js";
import type { Candidate } from "../candidates/service.js";
import { blendCandidates } from "./blend.js";

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

const noHeard = buildHeardIndex([]);
function heardOf(...mbids: string[]) {
  return buildHeardIndex(
    mbids.map((mbid) => ({
      recordingMbid: mbid,
      playCount: 1,
      lastListenedAtMs: 0,
    })),
  );
}

describe("blendCandidates", () => {
  it("dedups by (artist,title) case-insensitively, keeping the lowest rank", () => {
    const out = blendCandidates(
      [
        {
          candidates: [
            cand({ popularityRank: 5, name: "Song", artist: "A", mbid: "x5" }),
          ],
        },
        {
          candidates: [
            cand({ popularityRank: 1, name: "song", artist: "a", mbid: "x1" }),
          ],
        },
      ],
      noHeard,
      "downweight",
      10,
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.mbid).toBe("x1"); // lowest rank kept
  });

  it("exclude policy drops heard candidates entirely", () => {
    const out = blendCandidates(
      [
        {
          candidates: [
            cand({ popularityRank: 0, mbid: "heard", name: "A" }),
            cand({ popularityRank: 1, mbid: "fresh", name: "B" }),
          ],
        },
      ],
      heardOf("heard"),
      "exclude",
      10,
    );
    expect(out.map((c) => c.mbid)).toEqual(["fresh"]);
  });

  it("downweight policy sinks heard behind unheard without removing (mbid-less = unheard)", () => {
    const out = blendCandidates(
      [
        {
          candidates: [
            cand({ popularityRank: 0, mbid: "heard-A", name: "A" }),
            cand({ popularityRank: 1, mbid: "fresh-A", name: "B" }),
            cand({ popularityRank: 2, mbid: "heard-B", name: "C" }),
            cand({ popularityRank: 3, mbid: "fresh-B", name: "D" }),
            cand({ popularityRank: 4, mbid: null, name: "E" }),
          ],
        },
      ],
      heardOf("heard-A", "heard-B"),
      "downweight",
      10,
    );
    expect(out.map((c) => c.mbid)).toEqual([
      "fresh-A",
      "fresh-B",
      null,
      "heard-A",
      "heard-B",
    ]);
  });

  it("round-robin interleaves equal-weight sources (no weights)", () => {
    const out = blendCandidates(
      [
        {
          candidates: [
            cand({ popularityRank: 0, mbid: "a0", name: "a0", artist: "A" }),
            cand({ popularityRank: 1, mbid: "a1", name: "a1", artist: "A" }),
          ],
        },
        {
          candidates: [
            cand({ popularityRank: 0, mbid: "b0", name: "b0", artist: "B" }),
            cand({ popularityRank: 1, mbid: "b1", name: "b1", artist: "B" }),
          ],
        },
      ],
      noHeard,
      "exclude",
      10,
    );
    expect(out.map((c) => c.mbid)).toEqual(["a0", "b0", "a1", "b1"]);
  });

  it("weight-proportional interleave lets the heavier source lead and dominate the head", () => {
    const out = blendCandidates(
      [
        {
          weight: 2,
          candidates: [
            cand({ popularityRank: 0, mbid: "a0", name: "a0", artist: "A" }),
            cand({ popularityRank: 1, mbid: "a1", name: "a1", artist: "A" }),
            cand({ popularityRank: 2, mbid: "a2", name: "a2", artist: "A" }),
          ],
        },
        {
          weight: 1,
          candidates: [
            cand({ popularityRank: 0, mbid: "b0", name: "b0", artist: "B" }),
            cand({ popularityRank: 1, mbid: "b1", name: "b1", artist: "B" }),
          ],
        },
      ],
      noHeard,
      "exclude",
      10,
    );
    expect(out.map((c) => c.mbid)).toEqual(["a0", "a1", "b0", "a2", "b1"]);
  });

  it("caps the result to limit", () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      cand({ popularityRank: i, mbid: `m-${i}`, name: `n-${i}` }),
    );
    const out = blendCandidates(
      [{ candidates: many }],
      noHeard,
      "downweight",
      25,
    );
    expect(out).toHaveLength(25);
  });

  it("downweight partitions per-source: a heard item from a heavier source can precede an unheard item from a lighter one", () => {
    const out = blendCandidates(
      [
        {
          weight: 2,
          candidates: [
            cand({ popularityRank: 0, mbid: "a0", name: "a0", artist: "A" }),
            cand({
              popularityRank: 1,
              mbid: "heardA",
              name: "aH",
              artist: "A",
            }),
          ],
        },
        {
          weight: 1,
          candidates: [
            cand({ popularityRank: 0, mbid: "b0", name: "b0", artist: "B" }),
            cand({
              popularityRank: 1,
              mbid: "heardB",
              name: "bH",
              artist: "B",
            }),
          ],
        },
      ],
      heardOf("heardA", "heardB"),
      "downweight",
      10,
    );
    // A (w=2): unheard a0 → key 0.5, heard heardA → key 1.0.
    // B (w=1): unheard b0 → key 1.0, heard heardB → key 2.0.
    // Tie at 1.0 (heardA sourceIdx 0 vs b0 sourceIdx 1) → heardA first.
    expect(out.map((c) => c.mbid)).toEqual(["a0", "heardA", "b0", "heardB"]);
  });

  it("returns [] for no sources or all-empty sources", () => {
    expect(blendCandidates([], noHeard, "exclude", 10)).toEqual([]);
    expect(
      blendCandidates(
        [{ candidates: [] }, { candidates: [] }],
        noHeard,
        "exclude",
        10,
      ),
    ).toEqual([]);
  });
});
