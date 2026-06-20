import { mosaicArtFromTracks } from "./mosaic-art";

describe("mosaicArtFromTracks", () => {
  it("returns an empty array when no tracks have cover art", () => {
    expect(
      mosaicArtFromTracks([{ coverArtUrl: null }, { coverArtUrl: null }]),
    ).toEqual([]);
  });

  it("returns the single cover art when only one unique art exists", () => {
    expect(
      mosaicArtFromTracks([
        { coverArtUrl: "a" },
        { coverArtUrl: null },
        { coverArtUrl: "a" },
      ]),
    ).toEqual(["a"]);
  });

  it("preserves track order and de-duplicates", () => {
    expect(
      mosaicArtFromTracks([
        { coverArtUrl: "a" },
        { coverArtUrl: "b" },
        { coverArtUrl: "a" },
        { coverArtUrl: "c" },
      ]),
    ).toEqual(["a", "b", "c"]);
  });

  it("returns exactly 4 when 4 unique arts exist", () => {
    expect(
      mosaicArtFromTracks([
        { coverArtUrl: "a" },
        { coverArtUrl: "b" },
        { coverArtUrl: "c" },
        { coverArtUrl: "d" },
      ]),
    ).toEqual(["a", "b", "c", "d"]);
  });

  it("caps at the first 4 unique arts when more exist", () => {
    expect(
      mosaicArtFromTracks([
        { coverArtUrl: "a" },
        { coverArtUrl: "b" },
        { coverArtUrl: "c" },
        { coverArtUrl: "d" },
        { coverArtUrl: "e" },
      ]),
    ).toEqual(["a", "b", "c", "d"]);
  });

  it("handles an empty track list", () => {
    expect(mosaicArtFromTracks([])).toEqual([]);
  });
});
