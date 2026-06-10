import { beforeEach, describe, it, expect, vi } from "vitest";

vi.mock("../mbLookup.js", () => ({ searchRecordingsRich: vi.fn() }));

import { searchRecordingsRich } from "../mbLookup.js";
import {
  sanitizeTitleForSearch,
  escapeLuceneTerm,
  resolveRecordingByName,
} from "./fromSearch.js";
import type { RecordingCandidate } from "../types.js";

const mSearch = vi.mocked(searchRecordingsRich);

function candidate(mbid: string): RecordingCandidate {
  return {
    method: "search",
    recordingMbid: mbid,
    title: "T",
    durationMs: null,
    artistCredits: [],
    releases: [],
    acoustidScore: null,
  };
}
function hit(mbid: string) {
  return { candidate: candidate(mbid), mbScore: 100 };
}

beforeEach(() => vi.clearAllMocks());

// Characterization tests. sanitizeTitleForSearch strips trailing bracket
// annotations that break MusicBrainz phrase matching; escapeLuceneTerm
// escapes characters with special meaning in Lucene query syntax.

describe("sanitizeTitleForSearch", () => {
  it("strips a trailing square-bracket annotation", () => {
    expect(sanitizeTitleForSearch("Song [Hidden]")).toBe("Song");
  });

  it("strips a trailing parenthetical annotation", () => {
    expect(sanitizeTitleForSearch("Song (Bonus Track)")).toBe("Song");
  });

  it("strips multiple trailing annotations repeatedly", () => {
    expect(sanitizeTitleForSearch("Song [Hidden] (Live)")).toBe("Song");
  });

  it("strips trailing whitespace left after removing an annotation", () => {
    expect(sanitizeTitleForSearch("Song  [Hidden]")).toBe("Song");
  });

  it("does not strip an annotation that is the entire title (returns original)", () => {
    // Never returns empty — falls back to the original value.
    expect(sanitizeTitleForSearch("[Hidden]")).toBe("[Hidden]");
    expect(sanitizeTitleForSearch("(Bonus)")).toBe("(Bonus)");
  });

  it("leaves a title with no annotations unchanged", () => {
    expect(sanitizeTitleForSearch("Normal Title")).toBe("Normal Title");
  });

  it("does not strip mid-title brackets", () => {
    expect(sanitizeTitleForSearch("Song [Edit] Remix")).toBe(
      "Song [Edit] Remix",
    );
  });
});

describe("escapeLuceneTerm", () => {
  it("escapes double quotes", () => {
    expect(escapeLuceneTerm('Title "with" quotes')).toBe(
      'Title \\"with\\" quotes',
    );
  });

  it("escapes backslashes", () => {
    expect(escapeLuceneTerm("path\\to")).toBe("path\\\\to");
  });

  it("leaves plain text unchanged", () => {
    expect(escapeLuceneTerm("plain title")).toBe("plain title");
  });

  it("escapes both backslash and quote together", () => {
    expect(escapeLuceneTerm('back\\and"quote')).toBe('back\\\\and\\"quote');
  });
});

describe("resolveRecordingByName", () => {
  it("returns [] without searching when artist or title is missing", async () => {
    expect(await resolveRecordingByName({ artist: "", title: "T" })).toEqual(
      [],
    );
    expect(await resolveRecordingByName({ artist: "A", title: "" })).toEqual(
      [],
    );
    expect(mSearch).not.toHaveBeenCalled();
  });

  it("tries the album-filtered query first, then falls back to album-less", async () => {
    mSearch.mockResolvedValueOnce([]).mockResolvedValueOnce([hit("m1")]);

    const out = await resolveRecordingByName({
      artist: "Artist",
      title: "Song",
      album: "Album",
    });

    expect(out).toEqual([candidate("m1")]);
    expect(mSearch).toHaveBeenCalledTimes(2);
    expect(mSearch.mock.calls[0]![0]).toBe(
      'artist:"Artist" AND recording:"Song" AND release:"Album" AND video:false',
    );
    expect(mSearch.mock.calls[1]![0]).toBe(
      'artist:"Artist" AND recording:"Song" AND video:false',
    );
  });

  it("issues only the album-less query when no album is given", async () => {
    mSearch.mockResolvedValue([hit("m1")]);

    await resolveRecordingByName({ artist: "Artist", title: "Song" });

    expect(mSearch).toHaveBeenCalledTimes(1);
    expect(mSearch.mock.calls[0]![0]).toBe(
      'artist:"Artist" AND recording:"Song" AND video:false',
    );
  });

  it("returns candidates from the first query that yields results", async () => {
    mSearch.mockResolvedValue([hit("m1"), hit("m2")]);

    const out = await resolveRecordingByName({ artist: "A", title: "B" });

    expect(out).toEqual([candidate("m1"), candidate("m2")]);
    expect(mSearch).toHaveBeenCalledTimes(1);
  });

  it("falls back to a cleaned-title variant when the raw title yields nothing", async () => {
    mSearch.mockResolvedValue([]); // every query empty
    await resolveRecordingByName({ artist: "A", title: "Song [Hidden]" });

    const queries = mSearch.mock.calls.map((c) => c[0]);
    expect(queries).toContain(
      'artist:"A" AND recording:"Song [Hidden]" AND video:false',
    );
    expect(queries).toContain(
      'artist:"A" AND recording:"Song" AND video:false',
    );
  });
});
