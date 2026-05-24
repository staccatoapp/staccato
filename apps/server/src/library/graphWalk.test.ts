import { describe, expect, it } from "vitest";
import type { RecordingCandidate, ScoredCandidate } from "./types.js";
import { pickLeadArtist, pickRelease } from "./graphWalk.js";
import {
  makeCandidate,
  makeCredit,
  makeRelease,
  makeTags,
} from "./__fixtures__/builders.js";

// Characterization tests for the release-disambiguation chain. Each step in
// pickRelease assigns a fixed confidence; these freeze which release wins (and
// the confidence) for representative inputs at every step of the chain.

const winner = (
  overrides: Partial<RecordingCandidate> = {},
): ScoredCandidate => ({
  ...makeCandidate(overrides),
  score: 1,
});

describe(pickRelease.name, () => {
  it("returns null when the recording has no releases", () => {
    expect(pickRelease(winner({ releases: [] }), makeTags())).toBeNull();
  });

  it("step 1: an exact release-MBID tag match wins with confidence 1.0", () => {
    const resolved = pickRelease(
      winner({
        releases: [
          makeRelease({ releaseMbid: "other" }),
          makeRelease({
            releaseMbid: "rel-exact",
            releaseGroupMbid: "rg-exact",
          }),
        ],
      }),
      makeTags({ mbAlbumId: "rel-exact" }),
    );
    expect(resolved).toMatchObject({
      releaseMbid: "rel-exact",
      releaseGroupMbid: "rg-exact",
      confidence: 1,
    });
  });

  it("step 1.5: album-title match prefers Official + year, confidence 0.95", () => {
    const resolved = pickRelease(
      winner({
        releases: [
          makeRelease({
            releaseMbid: "off-1999",
            title: "The Album",
            date: "1999-01-01",
          }),
          makeRelease({
            releaseMbid: "off-2001",
            title: "The Album",
            date: "2001-05-01",
          }),
          makeRelease({
            releaseMbid: "boot",
            title: "The Album",
            status: "Bootleg",
            date: "2001-02-01",
          }),
        ],
      }),
      makeTags({ mbAlbumId: null, albumTitle: "The Album", year: 2001 }),
    );
    expect(resolved).toMatchObject({
      releaseMbid: "off-2001",
      confidence: 0.95,
    });
  });

  it("step 1.5: album-title match without a year hit takes earliest, confidence 0.9", () => {
    const resolved = pickRelease(
      winner({
        releases: [
          makeRelease({
            releaseMbid: "off-2005",
            title: "The Album",
            date: "2005-01-01",
          }),
          makeRelease({
            releaseMbid: "off-2000",
            title: "The Album",
            date: "2000-01-01",
          }),
        ],
      }),
      makeTags({ mbAlbumId: null, albumTitle: "The Album", year: null }),
    );
    expect(resolved).toMatchObject({
      releaseMbid: "off-2000",
      confidence: 0.9,
    });
  });

  it("step 2: a single album-type release wins with confidence 0.8", () => {
    const resolved = pickRelease(
      winner({
        releases: [
          makeRelease({ releaseMbid: "the-album", primaryType: "Album" }),
          makeRelease({ releaseMbid: "the-single", primaryType: "Single" }),
        ],
      }),
      makeTags({ mbAlbumId: null, albumTitle: null }),
    );
    expect(resolved).toMatchObject({
      releaseMbid: "the-album",
      confidence: 0.8,
    });
  });

  it("step 2: excludes disqualifying secondary types (e.g. Live)", () => {
    const resolved = pickRelease(
      winner({
        releases: [
          makeRelease({
            releaseMbid: "studio",
            primaryType: "Album",
            secondaryTypes: [],
          }),
          makeRelease({
            releaseMbid: "live",
            primaryType: "Album",
            secondaryTypes: ["Live"],
          }),
        ],
      }),
      makeTags({ mbAlbumId: null, albumTitle: null }),
    );
    expect(resolved).toMatchObject({ releaseMbid: "studio", confidence: 0.8 });
  });

  it("step 3: among multiple albums, earliest date wins with confidence 0.7", () => {
    const resolved = pickRelease(
      winner({
        releases: [
          makeRelease({ releaseMbid: "late", date: "2005-01-01" }),
          makeRelease({ releaseMbid: "early", date: "1999-01-01" }),
        ],
      }),
      makeTags({ mbAlbumId: null, albumTitle: null }),
    );
    expect(resolved).toMatchObject({ releaseMbid: "early", confidence: 0.7 });
  });

  it("step 3: with no album-type releases, earliest wins with confidence 0.6", () => {
    const resolved = pickRelease(
      winner({
        releases: [
          makeRelease({
            releaseMbid: "s-late",
            primaryType: "Single",
            date: "2005-01-01",
          }),
          makeRelease({
            releaseMbid: "s-early",
            primaryType: "Single",
            date: "1999-01-01",
          }),
        ],
      }),
      makeTags({ mbAlbumId: null, albumTitle: null }),
    );
    expect(resolved).toMatchObject({ releaseMbid: "s-early", confidence: 0.6 });
  });

  it("step 4: date ties broken by presence of a country, confidence 0.5", () => {
    const resolved = pickRelease(
      winner({
        releases: [
          makeRelease({ releaseMbid: "nc", date: "2000-01-01", country: null }),
          makeRelease({ releaseMbid: "us", date: "2000-01-01", country: "US" }),
        ],
      }),
      makeTags({ mbAlbumId: null, albumTitle: null }),
    );
    expect(resolved).toMatchObject({ releaseMbid: "us", confidence: 0.5 });
  });

  it("step 5: digital source prefers digital media, confidence 0.4", () => {
    const resolved = pickRelease(
      winner({
        releases: [
          makeRelease({
            releaseMbid: "cd",
            date: "2000-01-01",
            country: "US",
            mediaFormats: ["CD"],
          }),
          makeRelease({
            releaseMbid: "dig",
            date: "2000-01-01",
            country: "US",
            mediaFormats: ["Digital Media"],
          }),
        ],
      }),
      makeTags({ mbAlbumId: null, albumTitle: null, fileFormat: "flac" }),
    );
    expect(resolved).toMatchObject({ releaseMbid: "dig", confidence: 0.4 });
  });

  it("fallback: fully ambiguous releases pick the first remaining at confidence 0.3", () => {
    const resolved = pickRelease(
      winner({
        releases: [
          makeRelease({ releaseMbid: "a", date: "2000-01-01", country: "US" }),
          makeRelease({ releaseMbid: "b", date: "2000-01-01", country: "US" }),
        ],
      }),
      makeTags({ mbAlbumId: null, albumTitle: null, fileFormat: "flac" }),
    );
    expect(resolved).toMatchObject({ releaseMbid: "a", confidence: 0.3 });
  });

  it("inherits the release-group MBID from the chosen release, not independently", () => {
    const resolved = pickRelease(
      winner({
        releases: [
          makeRelease({
            releaseMbid: "early-rel",
            releaseGroupMbid: "rg-early",
            date: "1999-01-01",
          }),
          makeRelease({
            releaseMbid: "late-rel",
            releaseGroupMbid: "rg-late",
            date: "2005-01-01",
          }),
        ],
      }),
      makeTags({ mbAlbumId: null, albumTitle: null }),
    );
    expect(resolved!.releaseMbid).toBe("early-rel");
    expect(resolved!.releaseGroupMbid).toBe("rg-early");
  });
});

describe("pickLeadArtist", () => {
  it("returns the first credit as the lead (collaboration ordering preserved)", () => {
    const lead = pickLeadArtist(
      winner({
        artistCredits: [
          makeCredit({ mbid: "doom", name: "MF DOOM", joinPhrase: " & " }),
          makeCredit({ mbid: "grimm", name: "MF Grimm", joinPhrase: null }),
        ],
      }),
    );
    expect(lead).toEqual({ mbid: "doom", name: "MF DOOM" });
  });

  it("returns the main artist as lead when a featured artist follows", () => {
    const lead = pickLeadArtist(
      winner({
        artistCredits: [
          makeCredit({
            mbid: "main",
            name: "Main Artist",
            joinPhrase: " feat. ",
          }),
          makeCredit({
            mbid: "feat",
            name: "Featured Guest",
            joinPhrase: null,
          }),
        ],
      }),
    );
    expect(lead).toEqual({ mbid: "main", name: "Main Artist" });
  });

  it("returns null when there are no artist credits", () => {
    expect(pickLeadArtist(winner({ artistCredits: [] }))).toBeNull();
  });
});
