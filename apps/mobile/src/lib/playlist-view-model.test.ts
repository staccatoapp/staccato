import type {
  PlaylistDetail,
  RecommendedPlaylist,
  RecommendedPlaylistTrack,
} from "@staccato/shared";

import {
  playlistDownloadable,
  playlistDurationLabel,
  playlistMetaLabel,
  playlistViewFromLibrary,
  playlistViewFromRecommended,
} from "./playlist-view-model";

function recTrack(
  overrides: Partial<RecommendedPlaylistTrack> = {},
): RecommendedPlaylistTrack {
  return {
    recordingMbid: "rec-1",
    title: "A Case of You",
    artistName: "Joni Mitchell",
    artistMbid: "art-1",
    albumTitle: "Blue",
    releaseGroupMbid: "rg-1",
    durationMs: 264000,
    coverArtUrl: null,
    inLibrary: true,
    localTrackId: "lt-1",
    ...overrides,
  };
}

function recommended(tracks: RecommendedPlaylistTrack[]): RecommendedPlaylist {
  return {
    id: "pl-rec",
    name: "Canyon Gold",
    description: "Laurel Canyon",
    trackCount: tracks.length,
    tracks,
    coverArtUrl: "http://art/cover.jpg",
    expiresAt: null,
    source: "listenbrainz",
  };
}

function libraryDetail(): PlaylistDetail {
  return {
    id: "pl-lib",
    name: "Morning Chill",
    description: null,
    updatedAt: null,
    coverArtUrls: ["http://art/a.jpg", "http://art/b.jpg"],
    tracks: [
      {
        entryId: "e1",
        trackId: "t1",
        recordingMbid: "mb-1",
        title: "Dreams",
        artistName: "Fleetwood Mac",
        albumTitle: "Rumours",
        albumId: "al-1",
        coverArtUrl: "http://art/r.jpg",
        durationSeconds: 254,
        trackNumber: 1,
        fileExtension: "flac",
        position: 0,
      },
      {
        entryId: "e2",
        trackId: "t2",
        recordingMbid: null,
        title: "Carey",
        artistName: "Joni Mitchell",
        albumTitle: "Blue",
        albumId: "al-2",
        coverArtUrl: null,
        durationSeconds: 184,
        trackNumber: 2,
        fileExtension: "mp3",
        position: 1,
      },
    ],
  };
}

describe("playlistDownloadable", () => {
  it("maps every owned track with its file format and keeps the detail snapshot", () => {
    const detail = libraryDetail();
    const c = playlistDownloadable(detail);
    expect(c).toMatchObject({
      id: "pl-lib",
      kind: "playlist",
      name: "Morning Chill",
    });
    expect(c.coverArtUrls).toEqual(["http://art/a.jpg", "http://art/b.jpg"]);
    expect(c.tracks).toEqual([
      { trackId: "t1", fileExtension: "flac", coverArtUrl: "http://art/r.jpg" },
      { trackId: "t2", fileExtension: "mp3", coverArtUrl: null },
    ]);
    expect(c.snapshot).toBe(detail);
  });
});

describe("playlistDurationLabel", () => {
  it("formats minutes under an hour", () => {
    expect(playlistDurationLabel(52 * 60)).toBe("52 min");
  });
  it("formats hours and minutes", () => {
    expect(playlistDurationLabel(72 * 60)).toBe("1 hr 12 min");
  });
  it("drops minutes on the hour", () => {
    expect(playlistDurationLabel(120 * 60)).toBe("2 hr");
  });
});

describe("playlistViewFromRecommended", () => {
  it("maps mode, source label, and single cover", () => {
    const view = playlistViewFromRecommended(recommended([recTrack()]));
    expect(view.mode).toBe("recommended");
    expect(view.source).toBe("ListenBrainz");
    expect(view.coverArtUrl).toBe("http://art/cover.jpg");
    expect(view.coverArtUrls).toEqual([]);
  });

  it("counts owned tracks and lists only owned ids as playable", () => {
    const view = playlistViewFromRecommended(
      recommended([
        recTrack({ inLibrary: true, localTrackId: "lt-1" }),
        recTrack({
          recordingMbid: "rec-2",
          title: "Heart of Gold",
          inLibrary: false,
          localTrackId: null,
        }),
      ]),
    );
    expect(view.total).toBe(2);
    expect(view.localCount).toBe(1);
    expect(view.playableTrackIds).toEqual(["lt-1"]);
  });

  it("builds a request subject for a not-in-library track with both MBIDs", () => {
    const view = playlistViewFromRecommended(
      recommended([
        recTrack({ inLibrary: false, localTrackId: null }),
        recTrack({
          title: "No MBIDs",
          inLibrary: false,
          localTrackId: null,
          releaseGroupMbid: null,
        }),
      ]),
    );
    expect(view.rows[0]!.requestSubject).toEqual({
      releaseGroupMbid: "rg-1",
      artistMbid: "art-1",
      artistName: "Joni Mitchell",
      albumTitle: "Blue",
      coverArtUrl: null,
      title: "A Case of You",
    });
    expect(view.rows[1]!.requestSubject).toBeNull();
  });

  it("never builds a request subject for an owned track", () => {
    const view = playlistViewFromRecommended(
      recommended([recTrack({ inLibrary: true, localTrackId: "lt-1" })]),
    );
    expect(view.rows[0]!.requestSubject).toBeNull();
  });

  it("labels a not-in-library row subtitle and derives duration from ms", () => {
    const view = playlistViewFromRecommended(
      recommended([recTrack({ inLibrary: false, localTrackId: null })]),
    );
    expect(view.rows[0]!.track.subtitle).toBe("Joni Mitchell · Not in library");
    expect(view.rows[0]!.durationSeconds).toBe(264);
  });
});

describe("playlistViewFromLibrary", () => {
  it("treats every track as owned and playable", () => {
    const view = playlistViewFromLibrary(libraryDetail());
    expect(view.mode).toBe("inLibrary");
    expect(view.total).toBe(2);
    expect(view.localCount).toBe(2);
    expect(view.playableTrackIds).toEqual(["t1", "t2"]);
    expect(view.rows.every((r) => r.track.inLibrary)).toBe(true);
    expect(view.rows.every((r) => r.requestSubject === null)).toBe(true);
  });

  it("exposes the cover mosaic and uses trackId as the gradient seed when no MBID", () => {
    const view = playlistViewFromLibrary(libraryDetail());
    expect(view.coverArtUrls).toEqual(["http://art/a.jpg", "http://art/b.jpg"]);
    expect(view.rows[0]!.track.recordingMbid).toBe("mb-1");
    expect(view.rows[1]!.track.recordingMbid).toBe("t2");
  });

  it("totals seconds and builds the meta label", () => {
    const view = playlistViewFromLibrary(libraryDetail());
    expect(view.totalSeconds).toBe(438);
    expect(playlistMetaLabel(view)).toBe("2 songs · 7 min");
  });
});
