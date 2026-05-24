import { describe, expect, it } from "vitest";
import {
  AUTO_COMMIT_THRESHOLD,
  pickWinner,
  scoreCandidates,
  stringSimilarity,
  TAG_VERIFIED_SCORE,
} from "./scoring.js";
import {
  makeCandidate,
  makeCredit,
  makeTags,
} from "./__fixtures__/builders.js";

// Characterization tests: the matcher is in a known-good state (98% high
// confidence over a 182-album sample). These freeze current behavior so any
// future change to the scoring weights surfaces as a failing test.

describe("stringSimilarity", () => {
  it("scores identical strings as 1", () => {
    expect(stringSimilarity("Test Title", "Test Title")).toBe(1);
  });

  it("treats two empty strings as a perfect match", () => {
    expect(stringSimilarity("", "")).toBe(1);
  });

  it("scores a non-empty string against an empty one as 0", () => {
    expect(stringSimilarity("Something", "")).toBe(0);
  });

  it("is case- and punctuation-insensitive (normalization)", () => {
    expect(stringSimilarity("Hello, World!", "hello world")).toBe(1);
  });

  it("treats hyphens as spaces", () => {
    expect(stringSimilarity("Jay-Z", "jay z")).toBe(1);
  });

  it("strips accented characters rather than folding them (current behavior)", () => {
    // known limitation: "café" normalizes to "caf", not "cafe".
    expect(stringSimilarity("café", "cafe")).toBeCloseTo(0.75, 5);
  });
});

describe("scoreCandidates", () => {
  it("fully trusts tag_mbid candidates regardless of text agreement", () => {
    const [scored] = scoreCandidates(
      [
        makeCandidate({
          method: "tag_mbid",
          title: "totally different title",
          artistCredits: [makeCredit({ name: "someone else" })],
          durationMs: 1,
        }),
      ],
      makeTags(),
    );
    expect(scored!.score).toBe(TAG_VERIFIED_SCORE);
    expect(scored!.score).toBe(1);
  });

  it("scores a perfect non-acoustid match at 1.0 (weights renormalize without acoustid)", () => {
    const [scored] = scoreCandidates(
      [makeCandidate({ method: "search", acoustidScore: null })],
      makeTags(),
    );
    expect(scored!.score).toBeCloseTo(1, 5);
  });

  it("lets a strong acoustid score carry a candidate with weak text agreement", () => {
    const [scored] = scoreCandidates(
      [
        makeCandidate({
          method: "acoustid",
          acoustidScore: 0.9,
          title: "zzzzzzzz",
          artistCredits: [makeCredit({ name: "qqqqqqqq" })],
          durationMs: null,
        }),
      ],
      makeTags({ durationSeconds: null }),
    );
    // acoustid weight (0.4) dominates; title/artist disagree, duration unknown.
    expect(scored!.score).toBeCloseTo(0.5118, 3);
    expect(scored!.score).toBeGreaterThan(AUTO_COMMIT_THRESHOLD - 0.4);
  });

  it("adds a +0.1 convergence bonus when two methods agree on a recording", () => {
    const tags = makeTags();
    const partial = {
      recordingMbid: "rec-converge",
      title: "partial title match xyz",
      acoustidScore: 0.5,
    };
    const searchOnly = makeCandidate({ method: "search", ...partial });

    const aloneScore = scoreCandidates([searchOnly], tags)[0]!.score;

    const together = scoreCandidates(
      [searchOnly, makeCandidate({ method: "acoustid", ...partial })],
      tags,
    );
    const searchScore = together.find((c) => c.method === "search")!.score;

    expect(searchScore).toBeCloseTo(Math.min(1, aloneScore + 0.1), 5);
  });

  it("does not apply the convergence bonus when both candidates share a method", () => {
    const tags = makeTags();
    const partial = {
      recordingMbid: "rec-same-method",
      title: "partial title match xyz",
      acoustidScore: 0.5,
    };
    const a = makeCandidate({ method: "search", ...partial });
    const aloneScore = scoreCandidates([a], tags)[0]!.score;

    const together = scoreCandidates(
      [a, makeCandidate({ method: "search", ...partial })],
      tags,
    );
    expect(together[0]!.score).toBeCloseTo(aloneScore, 5);
  });

  it("caps the convergence bonus at 1.0", () => {
    const tags = makeTags();
    // Two perfect (score 1.0) candidates that converge would be 1.1 uncapped.
    const together = scoreCandidates(
      [
        makeCandidate({ method: "search", recordingMbid: "rec-perfect" }),
        makeCandidate({ method: "acoustid", recordingMbid: "rec-perfect" }),
      ],
      tags,
    );
    for (const c of together) {
      expect(c.score).toBe(1);
    }
  });
});

describe("pickWinner", () => {
  it("returns null for an empty candidate list", () => {
    expect(pickWinner([])).toBeNull();
  });

  it("returns the highest-scoring candidate", () => {
    const winner = pickWinner([
      { ...makeCandidate({ recordingMbid: "low" }), score: 0.4 },
      { ...makeCandidate({ recordingMbid: "high" }), score: 0.9 },
      { ...makeCandidate({ recordingMbid: "mid" }), score: 0.7 },
    ]);
    expect(winner!.recordingMbid).toBe("high");
  });
});
