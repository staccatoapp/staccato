// Characterization tests: freeze the behavior of the shared ranking primitives
// (normalizeText, tokenCoverage, popularityScore) used on every unified search.

import { describe, expect, it } from "vitest";
import {
  normalizeText,
  popularityScore,
  POPULARITY_LOG_MAX,
  tokenCoverage,
} from "./search-rank.js";

describe("normalizeText", () => {
  it("returns empty array for null", () => {
    expect(normalizeText(null)).toEqual([]);
  });

  it("returns empty array for undefined", () => {
    expect(normalizeText(undefined)).toEqual([]);
  });

  it("returns empty array for empty string", () => {
    expect(normalizeText("")).toEqual([]);
  });

  it("returns empty array for whitespace-only string", () => {
    expect(normalizeText("   ")).toEqual([]);
  });

  it("lowercases and splits on whitespace", () => {
    expect(normalizeText("Hello World")).toEqual(["hello", "world"]);
  });

  it("strips diacritics via NFKD normalization", () => {
    // 'é' decomposes to 'e' + combining accent; the accent is stripped
    expect(normalizeText("Beyoncé")).toEqual(["beyonce"]);
  });

  it("replaces non-alphanumeric characters with spaces and splits", () => {
    expect(normalizeText("track-1")).toEqual(["track", "1"]);
  });

  it("collapses multiple spaces into separate tokens", () => {
    expect(normalizeText("  multiple   spaces  ")).toEqual([
      "multiple",
      "spaces",
    ]);
  });

  it("handles a string with only non-alphanumeric characters", () => {
    expect(normalizeText("---")).toEqual([]);
  });
});

describe("tokenCoverage", () => {
  it("returns 0 for empty query", () => {
    expect(tokenCoverage("", "frank ocean")).toBe(0);
  });

  it("returns 1.0 when identity contains all query tokens", () => {
    expect(tokenCoverage("frank ocean", "frank ocean")).toBe(1.0);
  });

  it("returns 0.5 when half the query tokens are found", () => {
    // "frank ocean" → 2 tokens; identity has only "frank"
    expect(tokenCoverage("frank ocean", "frank")).toBe(0.5);
  });

  it("returns 0 when no query tokens appear in identity", () => {
    expect(tokenCoverage("frank ocean", "lost")).toBe(0);
  });

  it("returns partial coverage for a three-token query", () => {
    // "frank ocean lost" → 3 tokens; identity covers "frank" and "ocean"
    expect(tokenCoverage("frank ocean lost", "frank ocean")).toBeCloseTo(
      2 / 3,
      10,
    );
  });

  it("returns 0 for null identity", () => {
    expect(tokenCoverage("frank ocean", null)).toBe(0);
  });

  it("returns 0 for undefined identity", () => {
    expect(tokenCoverage("frank ocean", undefined)).toBe(0);
  });

  it("treats duplicate query tokens as one (set semantics)", () => {
    // "ocean ocean" → Set size 1; identity has "ocean" → 1/1 = 1.0
    expect(tokenCoverage("ocean ocean", "ocean")).toBe(1.0);
  });

  it("applies normalizeText so diacritics and case are ignored", () => {
    expect(tokenCoverage("Beyoncé", "beyonce")).toBe(1.0);
  });
});

describe("popularityScore", () => {
  it("returns 0 for null", () => {
    expect(popularityScore(null)).toBe(0);
  });

  it("returns 0 for undefined", () => {
    expect(popularityScore(undefined)).toBe(0);
  });

  it("returns 0 for 0 listens", () => {
    expect(popularityScore(0)).toBe(0);
  });

  it("returns 0 for negative listen counts", () => {
    expect(popularityScore(-1)).toBe(0);
  });

  it("returns a positive score for a single listen", () => {
    // log10(2) / 7 ≈ 0.043
    expect(popularityScore(1)).toBeCloseTo(Math.log10(2) / POPULARITY_LOG_MAX, 10);
  });

  it("returns approximately 1.0 at the log ceiling (10^7 listens)", () => {
    const score = popularityScore(10 ** 7);
    expect(score).toBeCloseTo(1.0, 5);
  });

  it("clamps to 1.0 for listen counts above the ceiling", () => {
    expect(popularityScore(10 ** 9)).toBe(1.0);
  });

  it("returns a mid-range score for a moderately popular artist", () => {
    // 10^3.5 ≈ 3162 listens → log10(3163) / 7 ≈ 0.5002
    const listens = Math.round(10 ** 3.5);
    expect(popularityScore(listens)).toBeCloseTo(
      Math.log10(listens + 1) / POPULARITY_LOG_MAX,
      10,
    );
  });
});
