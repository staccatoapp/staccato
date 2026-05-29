import { describe, expect, it } from "vitest";
import {
  type DraftAlbum,
  type DraftTrack,
  arrayMove,
  buildEditPayload,
  computeDirty,
  creditString,
  normalizeCredits,
  renumberTracks,
  toDraftTrack,
} from "./edit-album-utils";

const credit = (
  name: string,
  joinPhrase: string | null,
  position: number,
  artistId = `a-${name}`,
) => ({ artistId, name, joinPhrase, position });

const album: DraftAlbum = {
  title: "Rumours",
  artistName: "Fleetwood Mac",
  releaseYear: 1977,
  coverArtUrl: null,
};

const track = (over: Partial<DraftTrack> = {}): DraftTrack => ({
  id: "t1",
  n: 1,
  disc: 1,
  title: "Dreams",
  dur: 254,
  artists: [{ name: "Fleetwood Mac", joinPhrase: null }],
  ...over,
});

describe("normalizeCredits", () => {
  it("sorts by position and strips artistId", () => {
    expect(
      normalizeCredits([credit("B", null, 1), credit("A", " feat. ", 0)], "X"),
    ).toEqual([
      { name: "A", joinPhrase: " feat. " },
      { name: "B", joinPhrase: null },
    ]);
  });

  it("falls back to the album artist when there are no credits", () => {
    expect(normalizeCredits([], "Fleetwood Mac")).toEqual([
      { name: "Fleetwood Mac", joinPhrase: null },
    ]);
  });
});

describe("toDraftTrack", () => {
  it("maps nulls to sensible defaults", () => {
    const d = toDraftTrack(
      {
        id: "x",
        title: "Untitled",
        trackNumber: null,
        discNumber: null,
        durationSeconds: null,
        artists: [],
      },
      "Fallback",
    );
    expect(d).toEqual({
      id: "x",
      n: 0,
      disc: 1,
      title: "Untitled",
      dur: 0,
      artists: [{ name: "Fallback", joinPhrase: null }],
    });
  });
});

describe("creditString", () => {
  it("joins with the previous credit's join phrase", () => {
    expect(
      creditString([
        { name: "A", joinPhrase: "feat." },
        { name: "B", joinPhrase: "&" },
        { name: "C", joinPhrase: null },
      ]),
    ).toBe("A feat. B & C");
  });

  it("uses a middot fallback when a join phrase is blank", () => {
    expect(
      creditString([
        { name: "A", joinPhrase: "" },
        { name: "B", joinPhrase: null },
      ]),
    ).toBe("A · B");
  });

  it("ignores empty names", () => {
    expect(
      creditString([
        { name: "A", joinPhrase: "&" },
        { name: "  ", joinPhrase: null },
      ]),
    ).toBe("A");
  });
});

describe("renumberTracks", () => {
  it("renumbers each disc 1..n in current order", () => {
    const result = renumberTracks([
      track({ id: "a", disc: 1, n: 9 }),
      track({ id: "b", disc: 1, n: 9 }),
      track({ id: "c", disc: 2, n: 9 }),
      track({ id: "d", disc: 2, n: 9 }),
    ]);
    expect(result.map((t) => [t.disc, t.n])).toEqual([
      [1, 1],
      [1, 2],
      [2, 1],
      [2, 2],
    ]);
  });
});

describe("arrayMove", () => {
  it("moves an item to a new index", () => {
    expect(arrayMove([1, 2, 3, 4], 0, 2)).toEqual([2, 3, 1, 4]);
  });
});

describe("computeDirty", () => {
  const orig = [track({ id: "t1" })];

  it("is zero when nothing changed", () => {
    expect(computeDirty(album, orig, album, [track({ id: "t1" })])).toBe(0);
  });

  it("counts each changed album field", () => {
    const edited = { ...album, title: "Tusk", releaseYear: 1979 };
    expect(computeDirty(album, orig, edited, [track({ id: "t1" })])).toBe(2);
  });

  it("counts track title and credit changes", () => {
    const edited = [
      track({
        id: "t1",
        title: "Dreams (Remaster)",
        artists: [
          { name: "Fleetwood Mac", joinPhrase: "feat." },
          { name: "Stevie Nicks", joinPhrase: null },
        ],
      }),
    ];
    // title + credit string = 2
    expect(computeDirty(album, orig, album, edited)).toBe(2);
  });

  it("counts added and removed tracks", () => {
    const added = [track({ id: "t1" }), track({ id: "t2" })];
    expect(computeDirty(album, orig, album, added)).toBe(1); // one added
    expect(computeDirty(album, orig, album, [])).toBe(1); // one removed
  });
});

describe("buildEditPayload", () => {
  it("drops empty credits and re-derives positions", () => {
    const payload = buildEditPayload(album, [
      track({
        id: "t1",
        artists: [
          { name: "A", joinPhrase: "feat." },
          { name: "", joinPhrase: null },
          { name: "B", joinPhrase: null },
        ],
      }),
    ]);
    const [first] = payload.tracks;
    expect(first?.artists).toEqual([
      { name: "A", joinPhrase: "feat.", position: 0 },
      { name: "B", joinPhrase: null, position: 1 },
    ]);
    expect(first).toMatchObject({
      trackId: "t1",
      trackNumber: 1,
      discNumber: 1,
      title: "Dreams",
    });
  });

  it("carries album fields through", () => {
    const payload = buildEditPayload(album, []);
    expect(payload).toMatchObject({
      title: "Rumours",
      artistName: "Fleetwood Mac",
      releaseYear: 1977,
      coverArtUrl: null,
      tracks: [],
    });
  });
});
