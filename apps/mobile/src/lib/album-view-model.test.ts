import type { UnifiedAlbumDetail } from "@staccato/shared";

import {
  albumDownloadable,
  albumDurationLabel,
  albumEyebrow,
  albumMetaLabel,
  albumTotalSeconds,
  albumTrackRows,
  playableTrackIds,
} from "./album-view-model";

function localDetail(
  over: Partial<{
    pendingTrackCount: number;
    artistName: string;
    releaseYear: number | null;
    coverArtUrl: string | null;
    tracks: {
      id: string;
      title: string;
      trackNumber: number | null;
      durationSeconds: number | null;
      recordingMbid: string | null;
      fileExtension: string | null;
      artists: { name: string; joinPhrase: string | null; position: number }[];
    }[];
  }> = {},
): UnifiedAlbumDetail {
  const tracks = over.tracks ?? [
    {
      id: "lt-1",
      title: "Second Hand News",
      trackNumber: 1,
      durationSeconds: 163,
      recordingMbid: "rec-1",
      fileExtension: "flac",
      artists: [],
    },
    {
      id: "lt-2",
      title: "Dreams",
      trackNumber: 2,
      durationSeconds: 254,
      recordingMbid: "rec-2",
      fileExtension: "mp3",
      artists: [],
    },
  ];
  return {
    source: "local",
    album: {
      id: "al-1",
      title: "Rumours",
      artistId: "ar-1",
      artistName: over.artistName ?? "Fleetwood Mac",
      releaseYear: over.releaseYear === undefined ? 1977 : over.releaseYear,
      releaseMbid: "rel-1",
      releaseGroupMbid: "rg-1",
      coverArtUrl: over.coverArtUrl ?? null,
      confidenceScore: 1,
      pendingTrackCount: over.pendingTrackCount ?? 0,
      artists: [],
    },
    tracks: tracks.map((t) => ({
      id: t.id,
      title: t.title,
      trackNumber: t.trackNumber,
      discNumber: null,
      durationSeconds: t.durationSeconds,
      recordingMbid: t.recordingMbid,
      fileExtension: t.fileExtension,
      artists: t.artists.map((a, i) => ({
        artistId: `ar-${i}`,
        name: a.name,
        joinPhrase: a.joinPhrase,
        position: a.position,
      })),
    })),
  } as UnifiedAlbumDetail;
}

function externalDetail(): UnifiedAlbumDetail {
  return {
    source: "external",
    album: {
      releaseGroupMbid: "rg-9",
      releaseMbid: "rel-9",
      title: "Tusk",
      artistName: "Fleetwood Mac",
      artistMbid: "amb-1",
      releaseYear: 1979,
      releaseType: "Album",
      artists: [],
      coverArtUrl: null,
    },
    tracks: [
      {
        discPosition: 1,
        trackPosition: 1,
        recordingMbid: "xrec-1",
        title: "Over & Over",
        durationMs: 274000,
      },
      {
        discPosition: 1,
        trackPosition: 2,
        recordingMbid: "xrec-2",
        title: "The Ledge",
        durationMs: 121000,
      },
    ],
  } as UnifiedAlbumDetail;
}

describe("durations", () => {
  it("sums local track durations in seconds", () => {
    expect(albumTotalSeconds(localDetail())).toBe(417);
  });

  it("sums external track durations from milliseconds", () => {
    expect(albumTotalSeconds(externalDetail())).toBe(395);
  });

  it("labels minutes under an hour", () => {
    expect(albumDurationLabel(417)).toBe("7 min");
  });

  it("labels hours and minutes over an hour", () => {
    expect(albumDurationLabel(3 * 3600 + 21 * 60)).toBe("3 hr 21 min");
  });

  it("builds a songs + duration meta label", () => {
    expect(albumMetaLabel(localDetail())).toBe("2 songs · 7 min");
  });

  it("singularises a one-song album", () => {
    const one = localDetail({
      tracks: [
        {
          id: "lt-1",
          title: "Solo",
          trackNumber: 1,
          durationSeconds: 60,
          recordingMbid: "rec-1",
          fileExtension: "flac",
          artists: [],
        },
      ],
    });
    expect(albumMetaLabel(one)).toBe("1 song · 1 min");
  });
});

describe("albumEyebrow", () => {
  it("uses the release year for a local album", () => {
    expect(albumEyebrow(localDetail())).toBe("1977");
  });

  it("omits a missing year", () => {
    expect(albumEyebrow(localDetail({ releaseYear: null }))).toBe("");
  });

  it("joins release type and year for an external album", () => {
    expect(albumEyebrow(externalDetail())).toBe("Album · 1979");
  });
});

describe("playableTrackIds", () => {
  it("returns every local track id", () => {
    expect(playableTrackIds(localDetail())).toEqual(["lt-1", "lt-2"]);
  });

  it("returns nothing for an external album", () => {
    expect(playableTrackIds(externalDetail())).toEqual([]);
  });
});

describe("albumTrackRows", () => {
  it("maps local tracks to owned, playable rows", () => {
    const rows = albumTrackRows(localDetail());
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      index: 1,
      durationSeconds: 163,
      track: {
        recordingMbid: "rec-1",
        title: "Second Hand News",
        inLibrary: true,
        localTrackId: "lt-1",
        artistName: "Fleetwood Mac",
        subtitle: "",
      },
    });
  });

  it("shows a track-level artist subtitle only when it differs from the album artist", () => {
    const detail = localDetail({
      artistName: "Fleetwood Mac",
      tracks: [
        {
          id: "lt-1",
          title: "Duet",
          trackNumber: 1,
          durationSeconds: 100,
          recordingMbid: "rec-1",
          fileExtension: "flac",
          artists: [
            { name: "Stevie Nicks", joinPhrase: " & ", position: 0 },
            { name: "Lindsey Buckingham", joinPhrase: null, position: 1 },
          ],
        },
      ],
    });
    expect(albumTrackRows(detail)[0]!.track.subtitle).toBe(
      "Stevie Nicks & Lindsey Buckingham",
    );
  });

  it("maps external tracks to non-owned, previewable rows", () => {
    const rows = albumTrackRows(externalDetail());
    expect(rows[0]).toMatchObject({
      index: 1,
      durationSeconds: 274,
      track: {
        recordingMbid: "xrec-1",
        title: "Over & Over",
        inLibrary: false,
        localTrackId: null,
        subtitle: "",
      },
    });
  });
});

describe("albumDownloadable", () => {
  it("maps a local album's owned tracks with their formats", () => {
    const detail = localDetail({ coverArtUrl: "http://art/r.jpg" });
    const c = albumDownloadable(detail);
    expect(c).toMatchObject({ id: "al-1", kind: "album", name: "Rumours" });
    expect(c!.coverArtUrls).toEqual(["http://art/r.jpg"]);
    expect(c!.tracks).toEqual([
      {
        trackId: "lt-1",
        fileExtension: "flac",
        coverArtUrl: "http://art/r.jpg",
      },
      {
        trackId: "lt-2",
        fileExtension: "mp3",
        coverArtUrl: "http://art/r.jpg",
      },
    ]);
    expect(c!.snapshot).toBe(detail);
  });

  it("returns no covers when the album has none", () => {
    expect(albumDownloadable(localDetail())!.coverArtUrls).toEqual([]);
  });

  it("returns null for an external album (no owned audio)", () => {
    expect(albumDownloadable(externalDetail())).toBeNull();
  });
});
