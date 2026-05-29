// Characterization tests: freeze current behavior of isFeatureJoinPhrase and
// computePrimaryFlags so any regression in album-ownership classification surfaces
// as a failing test. computePrimaryFlags is on the hot path of every library scan.

import { describe, expect, it } from "vitest";
import {
  computePrimaryFlags,
  isFeatureJoinPhrase,
} from "./artist-credit.js";

describe("isFeatureJoinPhrase", () => {
  it("returns false for null", () => {
    expect(isFeatureJoinPhrase(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isFeatureJoinPhrase(undefined)).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isFeatureJoinPhrase("")).toBe(false);
  });

  it("returns true for 'feat.'", () => {
    expect(isFeatureJoinPhrase("feat.")).toBe(true);
  });

  it("returns true for 'feat' without trailing dot", () => {
    expect(isFeatureJoinPhrase("feat")).toBe(true);
  });

  it("returns true for 'ft.'", () => {
    expect(isFeatureJoinPhrase("ft.")).toBe(true);
  });

  it("returns true for 'ft' without trailing dot", () => {
    expect(isFeatureJoinPhrase("ft")).toBe(true);
  });

  it("returns true for 'featuring'", () => {
    expect(isFeatureJoinPhrase("featuring")).toBe(true);
  });

  it("returns true for uppercase 'FEAT.' (case insensitive)", () => {
    expect(isFeatureJoinPhrase("FEAT.")).toBe(true);
  });

  it("returns true for mixed-case 'Feat.'", () => {
    expect(isFeatureJoinPhrase("Feat.")).toBe(true);
  });

  it("returns true when the keyword is surrounded by spaces", () => {
    expect(isFeatureJoinPhrase(" feat. ")).toBe(true);
  });

  it("returns false for '&'", () => {
    expect(isFeatureJoinPhrase("&")).toBe(false);
  });

  it("returns false for 'and'", () => {
    expect(isFeatureJoinPhrase("and")).toBe(false);
  });

  it("returns false for 'vs.'", () => {
    expect(isFeatureJoinPhrase("vs.")).toBe(false);
  });

  it("returns false for ','", () => {
    expect(isFeatureJoinPhrase(",")).toBe(false);
  });
});

describe("computePrimaryFlags", () => {
  it("returns empty array for empty input", () => {
    expect(computePrimaryFlags([])).toEqual([]);
  });

  it("marks a single artist as primary", () => {
    expect(computePrimaryFlags([null])).toEqual([true]);
  });

  it("marks both artists as primary when joined by '&'", () => {
    // e.g. "MF Doom & MF Grimm" — joinPhrases: ["&", null]
    expect(computePrimaryFlags(["&", null])).toEqual([true, true]);
  });

  it("marks the featured artist as a guest", () => {
    // e.g. "Artist A feat. Artist B" — joinPhrases: ["feat.", null]
    expect(computePrimaryFlags(["feat.", null])).toEqual([true, false]);
  });

  it("marks only the third artist as guest when feat. comes after the second", () => {
    // e.g. "A & B feat. C" — joinPhrases: ["&", "feat.", null]
    expect(computePrimaryFlags(["&", "feat.", null])).toEqual([
      true,
      true,
      false,
    ]);
  });

  it("keeps all artists after the first feat. as guests even if subsequent join phrase is '&'", () => {
    // e.g. "A feat. B & C" — once guest flag is set, it stays
    // joinPhrases: ["feat.", "&", null]
    expect(computePrimaryFlags(["feat.", "&", null])).toEqual([
      true,
      false,
      false,
    ]);
  });

  it("handles uppercase FEAT. (case insensitive)", () => {
    expect(computePrimaryFlags(["FEAT.", null])).toEqual([true, false]);
  });

  it("handles featuring as the join phrase", () => {
    expect(computePrimaryFlags(["featuring", null])).toEqual([true, false]);
  });

  it("marks all artists as primary when all join phrases are non-feature", () => {
    // e.g. "A & B & C" — joinPhrases: ["&", "&", null]
    expect(computePrimaryFlags(["&", "&", null])).toEqual([true, true, true]);
  });
});
