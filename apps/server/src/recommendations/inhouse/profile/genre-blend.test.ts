import { describe, expect, it } from "vitest";
import {
  classifyTrackGenres,
  LEVEL_SPECIFICITY,
  MIN_GENRE_WEIGHT,
} from "./genre-blend.js";

describe("classifyTrackGenres", () => {
  it("blends across levels weighted by specificity and normalises to 1", () => {
    const vec = classifyTrackGenres({
      track: [{ name: "hip-hop", weight: 100 }],
      artist: [{ name: "hip-hop", weight: 100 }],
    });
    expect(vec).not.toBeNull();
    // hip-hop score = 1.0*track(1.0) + 1.0*artist(0.3) = 1.3 -> normalised 1.0
    expect(vec!.get("hip-hop")).toBeCloseTo(1, 5);
  });

  it("track-level tags outweigh artist-level for the same competing genres", () => {
    const vec = classifyTrackGenres({
      track: [{ name: "rap", weight: 100 }],
      artist: [{ name: "rock", weight: 100 }],
    })!;
    expect(vec.get("rap")!).toBeGreaterThan(vec.get("rock")!);
    // rap = 1.0, rock = 0.3 -> normalised 1.3 total
    expect(vec.get("rap")).toBeCloseTo(1.0 / 1.3, 5);
    expect(vec.get("rock")).toBeCloseTo(0.3 / 1.3, 5);
  });

  it("drops genres below the min-weight threshold as noise", () => {
    // artist-only tiny tag: 5/100 * 0.3 = 0.015 < MIN_GENRE_WEIGHT(0.1)
    const vec = classifyTrackGenres({
      artist: [{ name: "obscure", weight: 5 }],
    });
    expect(vec).toBeNull();
  });

  it("returns null (unclassified) when nothing clears the threshold", () => {
    expect(classifyTrackGenres({})).toBeNull();
    expect(classifyTrackGenres({ artist: [] })).toBeNull();
  });

  it("never guesses from artist alone when track/album are absent but weak", () => {
    // single artist tag at 30/100 * 0.3 = 0.09 < 0.1 -> unclassified
    expect(
      classifyTrackGenres({ artist: [{ name: "indie", weight: 30 }] }),
    ).toBeNull();
  });

  it("merges same-named tags case-insensitively", () => {
    const vec = classifyTrackGenres({
      track: [
        { name: "Hip-Hop", weight: 60 },
        { name: "hip-hop", weight: 60 },
      ],
    })!;
    expect([...vec.keys()]).toEqual(["hip-hop"]);
    expect(vec.get("hip-hop")).toBeCloseTo(1, 5);
  });

  it("exposes the tunable constants", () => {
    expect(LEVEL_SPECIFICITY.track).toBeGreaterThan(LEVEL_SPECIFICITY.album);
    expect(LEVEL_SPECIFICITY.album).toBeGreaterThan(LEVEL_SPECIFICITY.artist);
    expect(MIN_GENRE_WEIGHT).toBeGreaterThan(0);
  });
});
