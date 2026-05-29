import { describe, it, expect } from "vitest";
import { toMetadataSearchReleases } from "./map.js";

type RawRelease = {
  id: string;
  title?: string | null;
  date?: string | null;
  status?: string | null;
  score?: number | null;
  "artist-credit"?: Array<{ artist: { id: string; name: string } }> | null;
  "release-group"?: {
    id?: string | null;
    "primary-type"?: string | null;
  } | null;
};

function makeRelease(
  overrides: Partial<RawRelease> & { id: string },
): RawRelease {
  return {
    title: "Test Album",
    status: "Official",
    score: 80,
    "artist-credit": [{ artist: { id: "artist-1", name: "Test Artist" } }],
    "release-group": { id: "group-1", "primary-type": "Album" },
    ...overrides,
  };
}

describe("toMetadataSearchReleases", () => {
  it("returns empty array for empty input", () => {
    expect(toMetadataSearchReleases([])).toEqual([]);
  });

  it("returns one result per unique release-group", () => {
    const input = [
      makeRelease({ id: "r1", "release-group": { id: "group-1" } }),
      makeRelease({ id: "r2", "release-group": { id: "group-1" } }),
      makeRelease({ id: "r3", "release-group": { id: "group-2" } }),
    ];
    expect(toMetadataSearchReleases(input)).toHaveLength(2);
  });

  it("returns one result per release when no release-group", () => {
    const input = [
      makeRelease({ id: "r1", "release-group": null }),
      makeRelease({ id: "r2", "release-group": null }),
    ];
    expect(toMetadataSearchReleases(input)).toHaveLength(2);
  });

  it("selects the Official release within a group over the non-Official first entry", () => {
    const input = [
      makeRelease({
        id: "bootleg",
        status: "Bootleg",
        score: 90,
        "release-group": { id: "g1" },
      }),
      makeRelease({
        id: "official",
        status: "Official",
        score: 70,
        "release-group": { id: "g1" },
      }),
    ];
    const [result] = toMetadataSearchReleases(input);
    expect(result!.item.releaseMbid).toBe("official");
  });

  it("falls back to first release when the group has no Official entries", () => {
    const input = [
      makeRelease({
        id: "first",
        status: "Bootleg",
        "release-group": { id: "g1" },
      }),
      makeRelease({
        id: "second",
        status: "Bootleg",
        "release-group": { id: "g1" },
      }),
    ];
    const [result] = toMetadataSearchReleases(input);
    expect(result!.item.releaseMbid).toBe("first");
  });

  it("uses release.id as group key when release-group is missing", () => {
    const input = [makeRelease({ id: "standalone", "release-group": null })];
    const [result] = toMetadataSearchReleases(input);
    expect(result!.item.releaseMbid).toBe("standalone");
  });

  it("falls back artistName to Unknown Artist when no artist-credit", () => {
    const input = [makeRelease({ id: "r1", "artist-credit": null })];
    const [result] = toMetadataSearchReleases(input);
    expect(result!.item.artistName).toBe("Unknown Artist");
  });

  it("returns null releaseYear when date is missing", () => {
    const input = [makeRelease({ id: "r1", date: null })];
    const [result] = toMetadataSearchReleases(input);
    expect(result!.item.releaseYear).toBeNull();
  });

  it("parses releaseYear from the winning release date", () => {
    const input = [makeRelease({ id: "r1", date: "2018-06-01" })];
    const [result] = toMetadataSearchReleases(input);
    expect(result!.item.releaseYear).toBe(2018);
  });

  it("uses the winning release score as lexScore, not the first in group", () => {
    const input = [
      makeRelease({
        id: "bootleg",
        status: "Bootleg",
        score: 99,
        "release-group": { id: "g1" },
      }),
      makeRelease({
        id: "official",
        status: "Official",
        score: 55,
        "release-group": { id: "g1" },
      }),
    ];
    const [result] = toMetadataSearchReleases(input);
    expect(result!.item.releaseMbid).toBe("official");
    expect(result!.lexScore).toBe(55);
  });
});
