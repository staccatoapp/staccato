import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../library/candidates/fromSearch.js", () => ({
  resolveRecordingByName: vi.fn(),
}));
vi.mock("../../../library/scoring.js", () => ({
  scoreCandidates: vi.fn(),
}));
vi.mock("../../../db/queries/tracks.js", () => ({
  getTracksByMusicbrainzIds: vi.fn(),
}));
vi.mock("../../../musicbrainz/client.js", () => ({
  lookupRecording: vi.fn(),
  MB_PRIORITY: { BACKGROUND: 0 },
}));
vi.mock("../../../coverart/store.js", () => ({
  ensureCoverOnDisk: vi.fn(),
}));

import { resolveRecordingByName } from "../../../library/candidates/fromSearch.js";
import { scoreCandidates } from "../../../library/scoring.js";
import { getTracksByMusicbrainzIds } from "../../../db/queries/tracks.js";
import { lookupRecording } from "../../../musicbrainz/client.js";
import { ensureCoverOnDisk } from "../../../coverart/store.js";
import type { LocalTrackDetail } from "../../../db/queries/tracks.js";
import type { MBRecordingDetail } from "../../../musicbrainz/client.js";
import type { Candidate } from "../candidates/service.js";
import type { PlaylistSpec } from "../generators/types.js";
import {
  candidateNameKey,
  RECS_RESOLUTION_THRESHOLD,
  resolveCandidates,
  resolvePlaylists,
} from "./resolve.js";

const mResolveByName = vi.mocked(resolveRecordingByName);
const mScore = vi.mocked(scoreCandidates);
const mLocal = vi.mocked(getTracksByMusicbrainzIds);
const mLookup = vi.mocked(lookupRecording);
const mCover = vi.mocked(ensureCoverOnDisk);

const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn() } as never;

function cand(
  over: Partial<Candidate> & { popularityRank: number },
): Candidate {
  return {
    name: `Track ${over.popularityRank}`,
    artist: "Artist",
    mbid: null,
    ...over,
  };
}
function spec(
  candidates: Candidate[],
  over: Partial<PlaylistSpec> = {},
): PlaylistSpec {
  return {
    id: "inhouse:genre:test",
    name: "Test Mix",
    description: "desc",
    candidates,
    ...over,
  };
}
function recording(
  over: Partial<MBRecordingDetail> & { recordingMbid: string },
): MBRecordingDetail {
  return {
    title: "Recording",
    artistName: "Rec Artist",
    artistMbid: "rec-artist-mbid",
    releaseGroupMbid: "rg-1",
    releaseName: "Rec Album",
    releaseYear: 2020,
    durationMs: 200_000,
    ...over,
  };
}
function localTrack(
  over: Partial<LocalTrackDetail> & { trackId: string },
): LocalTrackDetail {
  return {
    title: "Local Title",
    artistName: "Local Artist",
    artistMbid: "local-artist-mbid",
    albumTitle: "Local Album",
    releaseGroupMbid: "local-rg",
    coverArtUrl: "/metadata/covers/local-rg.jpg",
    durationMs: 180_000,
    ...over,
  };
}

/**
 * Drive the name-resolution mocks: each track title maps to the recording mbid
 * its mirror-search resolves to, plus the winner score. A title absent from the
 * map yields no search results (→ dropped). The Last.fm candidate mbid is never
 * consulted by resolution — these mocks model the search path only.
 */
function resolvesTo(map: Record<string, { mbid: string; score: number }>) {
  mResolveByName.mockImplementation(async ({ title }) => {
    const hit = map[title];
    return hit ? [{ recordingMbid: hit.mbid, releases: [] } as never] : [];
  });
  mScore.mockImplementation(
    (cands) =>
      cands.map((c) => {
        const entry = Object.values(map).find(
          (m) => m.mbid === c.recordingMbid,
        );
        return { ...c, score: entry?.score ?? 0 };
      }) as never,
  );
}

/** A minimal release candidate (Official studio Album by default); override
 * `secondaryTypes`/`status`/`primaryType` to model compilations, DJ-mixes, etc. */
function release(over: Record<string, unknown> = {}) {
  return {
    releaseMbid: "rel-1",
    releaseGroupMbid: "rel-rg",
    title: "Release",
    date: null,
    country: null,
    status: "Official",
    primaryType: "Album",
    secondaryTypes: [],
    mediaFormats: [],
    ...over,
  };
}

/**
 * Like {@link resolvesTo} but a title resolves to *several* scored candidates
 * (in search order), each carrying its own releases — exercising the winner
 * tiebreak (in-library first, then canonical release type, then score).
 */
function resolvesToMany(
  map: Record<
    string,
    Array<{ mbid: string; score: number; releases?: unknown[] }>
  >,
) {
  mResolveByName.mockImplementation(async ({ title }) => {
    const list = map[title];
    return list
      ? (list.map((c) => ({
          recordingMbid: c.mbid,
          releases: c.releases ?? [],
        })) as never)
      : [];
  });
  mScore.mockImplementation(
    (cands) =>
      cands.map((c) => {
        const entry = Object.values(map)
          .flat()
          .find((m) => m.mbid === c.recordingMbid);
        return { ...c, score: entry?.score ?? 0 };
      }) as never,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mLocal.mockReturnValue(new Map());
  mLookup.mockResolvedValue(null);
  mCover.mockResolvedValue(null);
});

describe("resolvePlaylists", () => {
  it("name-resolves every candidate by search, ignoring the (flaky) Last.fm mbid", async () => {
    // Candidate arrives WITH a Last.fm mbid; resolution must ignore it and use
    // the search-resolved canonical mbid instead.
    resolvesTo({ "Track 0": { mbid: "canonical-1", score: 0.9 } });
    mLookup.mockResolvedValue(recording({ recordingMbid: "canonical-1" }));
    mCover.mockResolvedValue("/metadata/covers/rg-1.jpg");

    const out = await resolvePlaylists(
      [spec([cand({ popularityRank: 0, mbid: "lastfm-stale-mbid" })])],
      log,
    );

    expect(mResolveByName).toHaveBeenCalledWith({
      artist: "Artist",
      title: "Track 0",
    });
    expect(mLookup).toHaveBeenCalledWith("canonical-1", 0);
    expect(mLookup).not.toHaveBeenCalledWith("lastfm-stale-mbid", 0);
    expect(out[0]!.tracks[0]!.recordingMbid).toBe("canonical-1");
  });

  it("accepts a resolved candidate whose score clears the threshold", async () => {
    resolvesTo({
      "Track 0": { mbid: "resolved-1", score: RECS_RESOLUTION_THRESHOLD },
    });
    mLookup.mockResolvedValue(recording({ recordingMbid: "resolved-1" }));

    const out = await resolvePlaylists(
      [spec([cand({ popularityRank: 0 })])],
      log,
    );

    expect(out[0]!.tracks[0]!.recordingMbid).toBe("resolved-1");
  });

  it("drops a candidate whose best search match is below the threshold", async () => {
    resolvesTo({
      "Track 0": {
        mbid: "resolved-1",
        score: RECS_RESOLUTION_THRESHOLD - 0.01,
      },
    });

    const out = await resolvePlaylists(
      [spec([cand({ popularityRank: 0 })])],
      log,
    );

    expect(mLookup).not.toHaveBeenCalled();
    expect(out).toEqual([]); // all dropped → playlist not served
  });

  it("drops a candidate that search cannot resolve at all", async () => {
    resolvesTo({}); // no title resolves

    const out = await resolvePlaylists(
      [spec([cand({ popularityRank: 0, mbid: "lastfm-mbid" })])],
      log,
    );

    expect(out).toEqual([]);
  });

  it("short-circuits to the local library when the resolved mbid is owned", async () => {
    resolvesTo({ "Track 0": { mbid: "owned-1", score: 0.9 } });
    mLocal.mockReturnValue(
      new Map([["owned-1", localTrack({ trackId: "track-1" })]]),
    );

    const out = await resolvePlaylists(
      [spec([cand({ popularityRank: 0 })])],
      log,
    );

    expect(mLookup).not.toHaveBeenCalled(); // local short-circuits enrichment
    expect(out[0]!.tracks[0]).toEqual({
      recordingMbid: "owned-1",
      title: "Local Title",
      artistName: "Local Artist",
      artistMbid: "local-artist-mbid",
      albumTitle: "Local Album",
      releaseGroupMbid: "local-rg",
      durationMs: 180_000,
      coverArtUrl: "/metadata/covers/local-rg.jpg",
      inLibrary: true,
      localTrackId: "track-1",
    });
  });

  it("preserves candidate order minus drops", async () => {
    // T0 resolves+local, T1 unresolved (dropped), T2 resolves+enriched.
    resolvesTo({
      "Track 0": { mbid: "m0", score: 0.9 },
      "Track 2": { mbid: "m2", score: 0.9 },
    });
    mLocal.mockReturnValue(new Map([["m0", localTrack({ trackId: "t0" })]]));
    mLookup.mockImplementation(async (mbid) =>
      mbid === "m2" ? recording({ recordingMbid: "m2" }) : null,
    );

    const out = await resolvePlaylists(
      [
        spec([
          cand({ popularityRank: 0 }),
          cand({ popularityRank: 1 }),
          cand({ popularityRank: 2 }),
        ]),
      ],
      log,
    );

    expect(out[0]!.tracks.map((t) => t.recordingMbid)).toEqual(["m0", "m2"]);
  });

  it("deduplicates name resolution across identical artist+title candidates", async () => {
    resolvesTo({ Dupe: { mbid: "m-dupe", score: 0.9 } });
    mLookup.mockResolvedValue(recording({ recordingMbid: "m-dupe" }));

    await resolvePlaylists(
      [
        spec([
          cand({ popularityRank: 0, name: "Dupe", mbid: "a" }),
          cand({ popularityRank: 1, name: "Dupe", mbid: "b" }),
        ]),
      ],
      log,
    );

    expect(mResolveByName).toHaveBeenCalledTimes(1);
  });

  it("uses the first surviving track with cover art as the playlist cover", async () => {
    resolvesTo({
      "Track 0": { mbid: "m1", score: 0.9 },
      "Track 1": { mbid: "m2", score: 0.9 },
    });
    mLookup.mockImplementation(async (mbid) =>
      recording({
        recordingMbid: mbid,
        releaseGroupMbid: mbid === "m1" ? null : "rg-2",
      }),
    );
    mCover.mockResolvedValue("/metadata/covers/rg-2.jpg");

    const out = await resolvePlaylists(
      [spec([cand({ popularityRank: 0 }), cand({ popularityRank: 1 })])],
      log,
    );

    expect(out[0]!.tracks[0]!.coverArtUrl).toBeNull();
    expect(out[0]!.coverArtUrl).toBe("/metadata/covers/rg-2.jpg");
  });

  it("resolves to the owned recording even when MusicBrainz ranks another first", async () => {
    // Both recordings of the song tie on score (no duration to separate them);
    // MB returns the compilation cut first, but the album cut is the one owned.
    resolvesToMany({
      "Track 0": [
        {
          mbid: "comp",
          score: 0.786,
          releases: [release({ secondaryTypes: ["Compilation"] })],
        },
        { mbid: "album", score: 0.786, releases: [release()] },
      ],
    });
    mLocal.mockReturnValue(
      new Map([["album", localTrack({ trackId: "t-own" })]]),
    );

    const out = await resolvePlaylists(
      [spec([cand({ popularityRank: 0 })])],
      log,
    );

    expect(mLookup).not.toHaveBeenCalled(); // owned → no enrichment
    expect(out[0]!.tracks[0]!.recordingMbid).toBe("album");
    expect(out[0]!.tracks[0]!.inLibrary).toBe(true);
    expect(out[0]!.tracks[0]!.localTrackId).toBe("t-own");
  });

  it("prefers the canonical album over a compilation when neither is owned", async () => {
    resolvesToMany({
      "Track 0": [
        {
          mbid: "comp",
          score: 0.786,
          releases: [release({ secondaryTypes: ["Compilation"] })],
        },
        { mbid: "album", score: 0.786, releases: [release()] },
      ],
    });
    mLookup.mockImplementation(async (mbid) =>
      recording({ recordingMbid: mbid }),
    );

    const out = await resolvePlaylists(
      [spec([cand({ popularityRank: 0 })])],
      log,
    );

    expect(out[0]!.tracks[0]!.recordingMbid).toBe("album");
    expect(out[0]!.tracks[0]!.inLibrary).toBe(false);
  });

  it("ownership outranks release type: an owned compilation beats an unowned album", async () => {
    // The clean album is listed first and is more canonical, but the user only
    // owns the compilation cut — ownership must still win (option 1 over 2).
    resolvesToMany({
      "Track 0": [
        { mbid: "album", score: 0.786, releases: [release()] },
        {
          mbid: "owned-comp",
          score: 0.786,
          releases: [release({ secondaryTypes: ["Compilation"] })],
        },
      ],
    });
    mLocal.mockReturnValue(
      new Map([["owned-comp", localTrack({ trackId: "t-comp" })]]),
    );

    const out = await resolvePlaylists(
      [spec([cand({ popularityRank: 0 })])],
      log,
    );

    expect(out[0]!.tracks[0]!.recordingMbid).toBe("owned-comp");
    expect(out[0]!.tracks[0]!.inLibrary).toBe(true);
  });
});

describe("resolveCandidates (shared nucleus)", () => {
  it("returns a map keyed by candidateNameKey with assembled tracks, owned-first", async () => {
    resolvesTo({ Pyramids: { mbid: "owned-1", score: 0.9 } });
    mLocal.mockReturnValue(
      new Map([["owned-1", localTrack({ trackId: "track-1" })]]),
    );

    const candidates: Candidate[] = [
      {
        name: "Pyramids",
        artist: "Frank Ocean",
        mbid: null,
        popularityRank: 0,
      },
    ];
    const map = await resolveCandidates(candidates, log);

    const track = map.get(candidateNameKey("Frank Ocean", "Pyramids"));
    expect(track?.inLibrary).toBe(true);
    expect(track?.localTrackId).toBe("track-1");
    expect(track?.recordingMbid).toBe("owned-1");
  });

  it("omits candidates that fail the resolution threshold", async () => {
    resolvesTo({
      Obscure: { mbid: "m-low", score: RECS_RESOLUTION_THRESHOLD - 0.1 },
    });

    const map = await resolveCandidates(
      [{ name: "Obscure", artist: "Nobody", mbid: null, popularityRank: 0 }],
      log,
    );

    expect(map.size).toBe(0);
  });

  it("enriches a resolved non-owned candidate via MusicBrainz", async () => {
    resolvesTo({ Nights: { mbid: "rec-2", score: 0.9 } });
    mLookup.mockResolvedValue(recording({ recordingMbid: "rec-2" }));
    mCover.mockResolvedValue("/metadata/covers/rg-1.jpg");

    const map = await resolveCandidates(
      [
        {
          name: "Nights",
          artist: "Frank Ocean",
          mbid: null,
          popularityRank: 0,
        },
      ],
      log,
    );

    const track = map.get(candidateNameKey("Frank Ocean", "Nights"));
    expect(track?.inLibrary).toBe(false);
    expect(track?.recordingMbid).toBe("rec-2");
    expect(track?.coverArtUrl).toBe("/metadata/covers/rg-1.jpg");
  });
});
