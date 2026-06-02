import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ArtistReleaseGroup } from "../musicbrainz/client.js";
import type { DiscographyAlbumRow } from "../db/queries/albums.js";
import {
  dedupById,
  isMainRelease,
  mergeDiscography,
  parseYear,
  sortByYearDesc,
} from "./discography.js";

vi.mock("../coverart/store.js", () => ({
  resolveAlbumCoverNow: ({ albumId }: { albumId: string }) =>
    `cover:library:${albumId}`,
  resolveExternalCoverNow: (mbid: string) => `cover:external:${mbid}`,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function makeRg(
  overrides: Partial<ArtistReleaseGroup> = {},
): ArtistReleaseGroup {
  return {
    releaseGroupMbid: "rg-mbid-1",
    title: "Test Album",
    firstReleaseDate: "2020-01-01",
    primaryType: "Album",
    secondaryTypes: [],
    ...overrides,
  };
}

function makeRow(
  overrides: Partial<DiscographyAlbumRow> = {},
): DiscographyAlbumRow {
  return {
    id: "row-id-1",
    title: "Test Album",
    releaseYear: 2020,
    releaseGroupMbid: "rg-mbid-1",
    coverArtUrl: null,
    ...overrides,
  };
}

describe("isMainRelease", () => {
  it("accepts an Album with no secondary types", () => {
    expect(
      isMainRelease(makeRg({ primaryType: "Album", secondaryTypes: [] })),
    ).toBe(true);
  });

  it("accepts an EP with no secondary types", () => {
    expect(
      isMainRelease(makeRg({ primaryType: "EP", secondaryTypes: [] })),
    ).toBe(true);
  });

  it("rejects a Single", () => {
    expect(isMainRelease(makeRg({ primaryType: "Single" }))).toBe(false);
  });

  it("rejects a null primaryType", () => {
    expect(isMainRelease(makeRg({ primaryType: null }))).toBe(false);
  });

  it("rejects an Album that is also a Live release", () => {
    expect(
      isMainRelease(makeRg({ primaryType: "Album", secondaryTypes: ["Live"] })),
    ).toBe(false);
  });

  it("rejects an Album that is a Compilation", () => {
    expect(
      isMainRelease(
        makeRg({ primaryType: "Album", secondaryTypes: ["Compilation"] }),
      ),
    ).toBe(false);
  });
});

describe("parseYear", () => {
  it("extracts the year from a full date string", () => {
    expect(parseYear("2020-06-15")).toBe(2020);
  });

  it("extracts the year from a year-only string", () => {
    expect(parseYear("1985")).toBe(1985);
  });

  it("returns null for a null input", () => {
    expect(parseYear(null)).toBeNull();
  });

  it("returns null for a non-numeric string", () => {
    expect(parseYear("unknown")).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(parseYear("")).toBeNull();
  });
});

describe("sortByYearDesc", () => {
  it("sorts items newest-first", () => {
    const items = [
      {
        inLibrary: true as const,
        id: "a",
        title: "A",
        releaseYear: 2000,
        releaseGroupMbid: null,
        coverArtUrl: null,
      },
      {
        inLibrary: true as const,
        id: "b",
        title: "B",
        releaseYear: 2020,
        releaseGroupMbid: null,
        coverArtUrl: null,
      },
      {
        inLibrary: true as const,
        id: "c",
        title: "C",
        releaseYear: 2010,
        releaseGroupMbid: null,
        coverArtUrl: null,
      },
    ];
    const sorted = sortByYearDesc(items);
    expect(sorted.map((i) => i.releaseYear)).toEqual([2020, 2010, 2000]);
  });

  it("places null-year items last", () => {
    const items = [
      {
        inLibrary: true as const,
        id: "a",
        title: "A",
        releaseYear: null,
        releaseGroupMbid: null,
        coverArtUrl: null,
      },
      {
        inLibrary: true as const,
        id: "b",
        title: "B",
        releaseYear: 2015,
        releaseGroupMbid: null,
        coverArtUrl: null,
      },
    ];
    const sorted = sortByYearDesc(items);
    expect(sorted[0]!.releaseYear).toBe(2015);
    expect(sorted[1]!.releaseYear).toBeNull();
  });

  it("does not mutate the input array", () => {
    const items = [
      {
        inLibrary: true as const,
        id: "a",
        title: "A",
        releaseYear: 2000,
        releaseGroupMbid: null,
        coverArtUrl: null,
      },
      {
        inLibrary: true as const,
        id: "b",
        title: "B",
        releaseYear: 2020,
        releaseGroupMbid: null,
        coverArtUrl: null,
      },
    ];
    const original = [...items];
    sortByYearDesc(items);
    expect(items).toEqual(original);
  });
});

describe("dedupById", () => {
  it("removes duplicate rows by id", () => {
    const result = dedupById([
      makeRow({ id: "dup" }),
      makeRow({ id: "dup", title: "Second" }),
    ]);
    expect(result).toHaveLength(1);
  });

  it("preserves rows with distinct ids", () => {
    const result = dedupById([makeRow({ id: "a" }), makeRow({ id: "b" })]);
    expect(result).toHaveLength(2);
  });

  it("returns an empty array for empty input", () => {
    expect(dedupById([])).toEqual([]);
  });
});

describe("mergeDiscography", () => {
  it("marks a library album matching by MBID as inLibrary: true", () => {
    const rg = makeRg({ releaseGroupMbid: "rg-1" });
    const row = makeRow({ id: "album-1", releaseGroupMbid: "rg-1" });
    const result = mergeDiscography([rg], [row]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ inLibrary: true, id: "album-1" });
  });

  it("emits inLibrary: false for a MB release not in the library", () => {
    const rg = makeRg({ releaseGroupMbid: "rg-missing", title: "Not Local" });
    const result = mergeDiscography([rg], []);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      inLibrary: false,
      releaseGroupMbid: "rg-missing",
      title: "Not Local",
    });
  });

  it("resolves the cover art URL for inLibrary: false items via the external resolver", () => {
    const rg = makeRg({ releaseGroupMbid: "rg-ext" });
    const result = mergeDiscography([rg], []);
    expect(result[0]!.coverArtUrl).toBe("cover:external:rg-ext");
  });

  it("resolves the cover art URL for inLibrary: true items via the library resolver", () => {
    const rg = makeRg({ releaseGroupMbid: "rg-lib" });
    const row = makeRow({ id: "album-lib", releaseGroupMbid: "rg-lib" });
    const result = mergeDiscography([rg], [row]);
    expect(result[0]!.coverArtUrl).toBe("cover:library:album-lib");
  });

  it("appends a library album with no MBID even when absent from MB results", () => {
    const row = makeRow({ id: "no-mbid", releaseGroupMbid: null });
    const result = mergeDiscography([], [row]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ inLibrary: true, id: "no-mbid" });
  });

  it("appends a library album whose MBID was filtered out by isMainRelease", () => {
    const rg = makeRg({
      releaseGroupMbid: "rg-live",
      primaryType: "Album",
      secondaryTypes: ["Live"],
    });
    const row = makeRow({ id: "album-live", releaseGroupMbid: "rg-live" });
    const result = mergeDiscography([rg], [row]);
    // rg is filtered, but the local album should still appear
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ inLibrary: true, id: "album-live" });
  });

  it("filters out MB release groups that are not Album or EP", () => {
    const rg = makeRg({ primaryType: "Single" });
    const result = mergeDiscography([rg], []);
    expect(result).toHaveLength(0);
  });

  it("returns items sorted newest-first", () => {
    const rgs = [
      makeRg({ releaseGroupMbid: "rg-a", firstReleaseDate: "2000-01-01" }),
      makeRg({ releaseGroupMbid: "rg-b", firstReleaseDate: "2020-01-01" }),
    ];
    const result = mergeDiscography(rgs, []);
    expect(result[0]!.releaseYear).toBe(2020);
    expect(result[1]!.releaseYear).toBe(2000);
  });
});
