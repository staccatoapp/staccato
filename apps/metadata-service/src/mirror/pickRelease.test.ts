import { describe, it, expect } from "vitest";
import { parseReleaseYear, pickBestRelease } from "./pickRelease.js";

describe("parseReleaseYear", () => {
  it("returns null for undefined", () => {
    expect(parseReleaseYear(undefined)).toBeNull();
  });

  it("returns null for null", () => {
    expect(parseReleaseYear(null)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseReleaseYear("")).toBeNull();
  });

  it("returns year from full date", () => {
    expect(parseReleaseYear("2020-01-15")).toBe(2020);
  });

  it("returns year from partial date", () => {
    expect(parseReleaseYear("2020-01")).toBe(2020);
  });

  it("returns year from year-only string", () => {
    expect(parseReleaseYear("2020")).toBe(2020);
  });

  it("returns null for non-numeric characters", () => {
    expect(parseReleaseYear("----")).toBeNull();
  });
});

describe("pickBestRelease", () => {
  it("returns null for empty array", () => {
    expect(pickBestRelease([])).toBeNull();
  });

  it("returns null when no Official releases", () => {
    expect(
      pickBestRelease([
        { id: "a", status: "Bootleg" },
        { id: "b", status: null },
      ]),
    ).toBeNull();
  });

  it("returns the id of the single Official release", () => {
    expect(pickBestRelease([{ id: "a", status: "Official" }])).toBe("a");
  });

  it("prefers Album over Single by type rank", () => {
    expect(
      pickBestRelease([
        {
          id: "single",
          status: "Official",
          "release-group": { "primary-type": "Single" },
        },
        {
          id: "album",
          status: "Official",
          "release-group": { "primary-type": "Album" },
        },
      ]),
    ).toBe("album");
  });

  it("prefers EP over Single by type rank", () => {
    expect(
      pickBestRelease([
        {
          id: "single",
          status: "Official",
          "release-group": { "primary-type": "Single" },
        },
        {
          id: "ep",
          status: "Official",
          "release-group": { "primary-type": "EP" },
        },
      ]),
    ).toBe("ep");
  });

  it("prefers Album over EP by type rank", () => {
    expect(
      pickBestRelease([
        {
          id: "ep",
          status: "Official",
          "release-group": { "primary-type": "EP" },
        },
        {
          id: "album",
          status: "Official",
          "release-group": { "primary-type": "Album" },
        },
      ]),
    ).toBe("album");
  });

  it("uses earlier date as tiebreaker within the same type", () => {
    expect(
      pickBestRelease([
        {
          id: "later",
          status: "Official",
          date: "2020-01-01",
          "release-group": { "primary-type": "Album" },
        },
        {
          id: "earlier",
          status: "Official",
          date: "2010-01-01",
          "release-group": { "primary-type": "Album" },
        },
      ]),
    ).toBe("earlier");
  });

  it("treats missing date as 9999 in tiebreak (does not crash)", () => {
    const result = pickBestRelease([
      {
        id: "nodatE",
        status: "Official",
        "release-group": { "primary-type": "Album" },
      },
      {
        id: "dated",
        status: "Official",
        date: "2020-01-01",
        "release-group": { "primary-type": "Album" },
      },
    ]);
    expect(result).toBe("dated");
  });

  it("ignores non-Official releases even when they have a better type rank", () => {
    expect(
      pickBestRelease([
        {
          id: "bootleg-album",
          status: "Bootleg",
          "release-group": { "primary-type": "Album" },
        },
        {
          id: "official-single",
          status: "Official",
          "release-group": { "primary-type": "Single" },
        },
      ]),
    ).toBe("official-single");
  });
});
