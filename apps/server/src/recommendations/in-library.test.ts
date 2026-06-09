import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/queries/tracks.js", () => ({
  getLocalTrackMbidsByMbids: vi.fn(),
  getTracksByMusicbrainzIds: vi.fn(),
  getLibraryTracksByArtistMbids: vi.fn(),
}));

import type {
  RecommendedPlaylist,
  RecommendedPlaylistTrack,
  RecommendedTrack,
} from "@staccato/shared";
import {
  getLibraryTracksByArtistMbids,
  getLocalTrackMbidsByMbids,
  getTracksByMusicbrainzIds,
  type LibrarySongRow,
  type LocalTrackDetail,
} from "../db/queries/tracks.js";
import {
  refreshPlaylistsInLibrary,
  refreshPlaylistTracksInLibrary,
  refreshTracksInLibrary,
} from "./in-library.js";

const mLocalMbids = vi.mocked(getLocalTrackMbidsByMbids);
const mTracksByMbids = vi.mocked(getTracksByMusicbrainzIds);
const mByArtist = vi.mocked(getLibraryTracksByArtistMbids);

const GAMBINO = "7fb57fba-a6ef-44c2-abab-2fa3bdee607e";

function track(over: Partial<RecommendedTrack> = {}): RecommendedTrack {
  return {
    recordingMbid: "rec-1",
    title: "Title",
    artistName: "Artist",
    artistMbid: GAMBINO,
    albumTitle: "Album",
    releaseGroupMbid: "rg-1",
    coverArtUrl: null,
    previewUrl: null,
    durationMs: 200_000,
    inLibrary: false,
    ...over,
  };
}
function plTrack(
  over: Partial<RecommendedPlaylistTrack> = {},
): RecommendedPlaylistTrack {
  return {
    recordingMbid: "rec-1",
    title: "Title",
    artistName: "Artist",
    artistMbid: GAMBINO,
    albumTitle: "Album",
    releaseGroupMbid: "rg-1",
    durationMs: 200_000,
    coverArtUrl: null,
    inLibrary: false,
    localTrackId: null,
    ...over,
  };
}
function playlist(tracks: RecommendedPlaylistTrack[]): RecommendedPlaylist {
  return {
    id: "pl-1",
    name: "Mix",
    description: null,
    trackCount: tracks.length,
    tracks,
    coverArtUrl: null,
    expiresAt: null,
    source: "staccato",
  };
}
function libSong(over: Partial<LibrarySongRow> = {}): LibrarySongRow {
  return {
    trackId: "lt-1",
    artistMbid: GAMBINO,
    title: "Title",
    canonicalTitle: null,
    durationMs: 200_000,
    ...over,
  };
}
function localDetail(trackId: string): LocalTrackDetail {
  return {
    trackId,
    title: "Local",
    artistName: "Artist",
    artistMbid: GAMBINO,
    albumTitle: "Local Album",
    releaseGroupMbid: "local-rg",
    coverArtUrl: null,
    durationMs: 200_000,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mLocalMbids.mockReturnValue([]);
  mTracksByMbids.mockReturnValue(new Map());
  mByArtist.mockReturnValue([]);
});

describe("refreshTracksInLibrary", () => {
  it("flags inLibrary on an exact recording-mbid match", () => {
    mLocalMbids.mockReturnValue(["rec-1"]);
    const out = refreshTracksInLibrary([track({ recordingMbid: "rec-1" })]);
    expect(out[0]!.inLibrary).toBe(true);
    // exact hit → no song-level fallback query
    expect(mByArtist).not.toHaveBeenCalled();
  });

  it("falls back to a song-level match when the recording mbid differs", () => {
    // The library owns "3005" under a different recording id than the rec.
    mLocalMbids.mockReturnValue([]);
    mByArtist.mockReturnValue([libSong({ trackId: "lt-3005", title: "3005" })]);
    const out = refreshTracksInLibrary([
      track({ recordingMbid: "lb-single", title: "3005", artistMbid: GAMBINO }),
    ]);
    expect(out[0]!.inLibrary).toBe(true);
    expect(mByArtist).toHaveBeenCalledWith([GAMBINO]);
  });

  it("matches via the raw tag title when the canonical title diverges", () => {
    // Real 3005 case: library raw title "3005", canonical "V. 3005". The rec
    // title is "3005" — must match on the raw title, not the canonical.
    mLocalMbids.mockReturnValue([]);
    mByArtist.mockReturnValue([
      libSong({ trackId: "lt-3005", title: "3005", canonicalTitle: "V. 3005" }),
    ]);
    const out = refreshTracksInLibrary([
      track({ recordingMbid: "lb-single", title: "3005" }),
    ]);
    expect(out[0]!.inLibrary).toBe(true);
  });

  it("matches via the canonical title too (source used the canonical form)", () => {
    mLocalMbids.mockReturnValue([]);
    mByArtist.mockReturnValue([
      libSong({ trackId: "lt-3005", title: "3005", canonicalTitle: "V. 3005" }),
    ]);
    const out = refreshTracksInLibrary([
      track({ recordingMbid: "lb-single", title: "V. 3005" }),
    ]);
    expect(out[0]!.inLibrary).toBe(true);
  });

  it("does not match a remix to the studio recording", () => {
    mLocalMbids.mockReturnValue([]);
    mByArtist.mockReturnValue([
      libSong({ trackId: "lt-remix", title: "3005 (Friction Remix)" }),
    ]);
    const out = refreshTracksInLibrary([
      track({ recordingMbid: "lb-single", title: "3005" }),
    ]);
    expect(out[0]!.inLibrary).toBe(false);
  });

  it("ignores the fallback when the rec has no artistMbid", () => {
    mLocalMbids.mockReturnValue([]);
    const out = refreshTracksInLibrary([
      track({ recordingMbid: "x", title: "3005", artistMbid: null }),
    ]);
    expect(out[0]!.inLibrary).toBe(false);
    expect(mByArtist).not.toHaveBeenCalled();
  });
});

describe("refreshPlaylistsInLibrary", () => {
  it("sets inLibrary + localTrackId on an exact match", () => {
    mTracksByMbids.mockReturnValue(new Map([["rec-1", localDetail("lt-1")]]));
    const out = refreshPlaylistsInLibrary([
      playlist([plTrack({ recordingMbid: "rec-1" })]),
    ]);
    expect(out[0]!.tracks[0]!.inLibrary).toBe(true);
    expect(out[0]!.tracks[0]!.localTrackId).toBe("lt-1");
    expect(mByArtist).not.toHaveBeenCalled();
  });

  it("falls back to a song-level match and sets localTrackId", () => {
    mTracksByMbids.mockReturnValue(new Map()); // exact miss
    mByArtist.mockReturnValue([libSong({ trackId: "lt-3005", title: "3005" })]);
    const out = refreshPlaylistsInLibrary([
      playlist([plTrack({ recordingMbid: "lb-single", title: "3005" })]),
    ]);
    expect(out[0]!.tracks[0]!.inLibrary).toBe(true);
    expect(out[0]!.tracks[0]!.localTrackId).toBe("lt-3005");
  });

  it("does not song-match a remix", () => {
    mTracksByMbids.mockReturnValue(new Map());
    mByArtist.mockReturnValue([
      libSong({ trackId: "lt-remix", title: "3005 (Friction Remix)" }),
    ]);
    const out = refreshPlaylistsInLibrary([
      playlist([plTrack({ recordingMbid: "lb-single", title: "3005" })]),
    ]);
    expect(out[0]!.tracks[0]!.inLibrary).toBe(false);
    expect(out[0]!.tracks[0]!.localTrackId).toBeNull();
  });

  it("prefers the exact match and skips the fallback for that track", () => {
    mTracksByMbids.mockReturnValue(
      new Map([["rec-1", localDetail("exact-id")]]),
    );
    mByArtist.mockReturnValue([
      libSong({ trackId: "song-id", title: "Title" }),
    ]);
    const out = refreshPlaylistsInLibrary([
      playlist([plTrack({ recordingMbid: "rec-1", title: "Title" })]),
    ]);
    expect(out[0]!.tracks[0]!.localTrackId).toBe("exact-id");
  });
});

describe("refreshPlaylistTracksInLibrary", () => {
  it("flips inLibrary + localTrackId on an exact recording-mbid hit", () => {
    mTracksByMbids.mockReturnValue(new Map([["rec-1", localDetail("t1")]]));
    const out = refreshPlaylistTracksInLibrary([
      plTrack({ recordingMbid: "rec-1" }),
    ]);
    expect(out[0]).toMatchObject({ inLibrary: true, localTrackId: "t1" });
    expect(mByArtist).not.toHaveBeenCalled();
  });

  it("falls back to a song-level match when the recording mbid differs", () => {
    mTracksByMbids.mockReturnValue(new Map()); // exact miss
    mByArtist.mockReturnValue([libSong({ trackId: "lt-3005", title: "3005" })]);
    const out = refreshPlaylistTracksInLibrary([
      plTrack({ recordingMbid: "lb-single", title: "3005" }),
    ]);
    expect(out[0]).toMatchObject({ inLibrary: true, localTrackId: "lt-3005" });
  });

  it("returns [] unchanged for an empty list", () => {
    expect(refreshPlaylistTracksInLibrary([])).toEqual([]);
  });
});
