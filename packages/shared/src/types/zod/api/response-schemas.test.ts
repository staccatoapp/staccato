import { describe, expect, it } from "vitest";
import { z } from "zod";
import { paginatedSchema } from "../../../pagination.js";
import {
  AlbumListItemSchema,
  AlbumListResponseSchema,
  AlbumSortSchema,
} from "./albums.js";
import {
  ArtistListResponseSchema,
  ArtistSchema,
  ArtistSearchItemSchema,
  ArtistSortSchema,
} from "./artists.js";
import {
  DownloadRequestSchema,
  LidarrOptionsSchema,
  LidarrSettingsSchema,
} from "./downloads.js";
import { LibrarySearchResultsSchema } from "./library.js";
import { SyncedLyricsLineSchema, TrackLyricsSchema } from "./lyrics.js";
import { PlaybackSessionSchema, PlaybackTrackSchema } from "./playback.js";
import {
  PlaylistDetailSchema,
  PlaylistListItemSchema,
  PlaylistListResponseSchema,
  PlaylistSortSchema,
  PlaylistTrackSchema,
} from "./playlists.js";
import { recommendationsResponseSchema } from "./recommendations.js";
import { ScanProgressSchema, TrackStatusCountsSchema } from "./scan.js";
import { ServerSettingsSchema } from "./settings.js";
import { TrackListItemSchema, TrackSearchResultSchema } from "./tracks.js";

const TRACK_ARTIST_CREDIT = {
  artistId: "a1",
  name: "Band",
  joinPhrase: null,
  position: 0,
};
const ALBUM_ARTIST_CREDIT = {
  artistId: "a1",
  name: "Band",
  joinPhrase: null,
  position: 0,
};

describe("paginatedSchema", () => {
  it("parses a valid paginated response", () => {
    const schema = paginatedSchema(z.string());
    expect(schema.parse({ items: ["a", "b"], total: 2 })).toEqual({
      items: ["a", "b"],
      total: 2,
    });
  });

  it("rejects when items is missing", () => {
    const schema = paginatedSchema(z.string());
    expect(() => schema.parse({ total: 1 })).toThrow(z.ZodError);
  });

  it("rejects when total is missing", () => {
    const schema = paginatedSchema(z.string());
    expect(() => schema.parse({ items: [] })).toThrow(z.ZodError);
  });
});

describe("TrackListItemSchema", () => {
  const valid = {
    id: "t1",
    title: "Song",
    artistId: "a1",
    artistName: "Artist",
    albumId: null,
    albumTitle: null,
    coverArtUrl: null,
    durationSeconds: null,
    fileFormat: null,
    artists: [TRACK_ARTIST_CREDIT],
  };

  it("parses a valid track list item", () => {
    expect(TrackListItemSchema.parse(valid)).toEqual(valid);
  });

  it("rejects when required id is missing", () => {
    expect(() =>
      TrackListItemSchema.parse({ ...valid, id: undefined }),
    ).toThrow(z.ZodError);
  });
});

describe("TrackSearchResultSchema", () => {
  it("parses a valid track search result (no artistId or fileFormat)", () => {
    const valid = {
      id: "t1",
      title: "Song",
      artistName: "Artist",
      albumId: null,
      albumTitle: null,
      coverArtUrl: null,
      durationSeconds: null,
      artists: [TRACK_ARTIST_CREDIT],
    };
    expect(TrackSearchResultSchema.parse(valid)).toEqual(valid);
  });

  it("strips artistId and fileFormat if present", () => {
    const result = TrackSearchResultSchema.parse({
      id: "t1",
      title: "Song",
      artistName: "Artist",
      albumId: null,
      albumTitle: null,
      coverArtUrl: null,
      durationSeconds: null,
      artists: [TRACK_ARTIST_CREDIT],
      artistId: "SHOULD_BE_STRIPPED",
      fileFormat: "SHOULD_BE_STRIPPED",
    });
    expect(result).not.toHaveProperty("artistId");
    expect(result).not.toHaveProperty("fileFormat");
  });
});

describe("PlaybackTrackSchema", () => {
  const valid = {
    id: "t1",
    title: "Song",
    trackNumber: null,
    discNumber: null,
    artistName: null,
    albumTitle: null,
    coverArtUrl: null,
    durationSeconds: null,
    artists: [TRACK_ARTIST_CREDIT],
  };

  it("parses a valid playback track", () => {
    expect(PlaybackTrackSchema.parse(valid)).toEqual(valid);
  });

  it("parses a track with an album title", () => {
    const withAlbum = { ...valid, albumTitle: "Rumours" };
    expect(PlaybackTrackSchema.parse(withAlbum)).toEqual(withAlbum);
  });

  it("rejects when albumTitle is missing", () => {
    const { albumTitle: _omitted, ...withoutAlbumTitle } = valid;
    expect(() => PlaybackTrackSchema.parse(withoutAlbumTitle)).toThrow(
      z.ZodError,
    );
  });
});

describe("PlaybackSessionSchema", () => {
  const validTrack = {
    id: "t1",
    title: "Song",
    trackNumber: 1,
    discNumber: 1,
    artistName: "Artist",
    albumTitle: null,
    coverArtUrl: null,
    durationSeconds: 180,
    artists: [],
  };

  it("parses a valid playback session", () => {
    const valid = {
      trackQueue: [validTrack],
      currentTrackIndex: 0,
      currentTrackPositionInSeconds: 10,
      currentTrackAccumulatedPlayTimeInSeconds: 10,
      currentTrackListenEventCreated: false,
      isPlaying: true,
    };
    expect(PlaybackSessionSchema.parse(valid)).toEqual(valid);
  });

  it("rejects when isPlaying is missing", () => {
    expect(() =>
      PlaybackSessionSchema.parse({
        trackQueue: [],
        currentTrackIndex: 0,
        currentTrackPositionInSeconds: 0,
        currentTrackAccumulatedPlayTimeInSeconds: 0,
        currentTrackListenEventCreated: false,
      }),
    ).toThrow(z.ZodError);
  });
});

describe("PlaylistListItemSchema", () => {
  const valid = {
    id: "p1",
    name: "My Playlist",
    description: null,
    trackCount: 5,
    coverArtUrls: [],
    updatedAt: null,
  };

  it("parses a valid playlist list item", () => {
    expect(PlaylistListItemSchema.parse(valid)).toEqual(valid);
  });
});

describe("PlaylistListResponseSchema", () => {
  it("parses a valid playlist list response", () => {
    const valid = {
      items: [
        {
          id: "p1",
          name: "Playlist",
          description: null,
          trackCount: 0,
          coverArtUrls: [],
          updatedAt: null,
        },
      ],
      total: 1,
    };
    expect(PlaylistListResponseSchema.parse(valid)).toEqual(valid);
  });

  it("rejects when total is missing", () => {
    const invalid = { items: [] };
    expect(() => PlaylistListResponseSchema.parse(invalid)).toThrow(z.ZodError);
  });
});

describe("library list sort schemas", () => {
  it("AlbumSortSchema accepts all four album sort keys", () => {
    for (const key of ["createdAt", "title", "artist", "year"] as const) {
      expect(AlbumSortSchema.parse(key)).toBe(key);
    }
  });

  it("AlbumSortSchema rejects an unknown key", () => {
    expect(() => AlbumSortSchema.parse("recent")).toThrow(z.ZodError);
  });

  it("ArtistSortSchema accepts createdAt and title only", () => {
    expect(ArtistSortSchema.parse("createdAt")).toBe("createdAt");
    expect(ArtistSortSchema.parse("title")).toBe("title");
    expect(() => ArtistSortSchema.parse("artist")).toThrow(z.ZodError);
    expect(() => ArtistSortSchema.parse("year")).toThrow(z.ZodError);
  });

  it("PlaylistSortSchema accepts createdAt and title only", () => {
    expect(PlaylistSortSchema.parse("createdAt")).toBe("createdAt");
    expect(PlaylistSortSchema.parse("title")).toBe("title");
    expect(() => PlaylistSortSchema.parse("year")).toThrow(z.ZodError);
  });
});

describe("AlbumListResponseSchema", () => {
  it("parses a valid album list response", () => {
    const valid = {
      items: [
        {
          id: "al1",
          title: "Album",
          artistId: "ar1",
          artistName: "Band",
          artists: [ALBUM_ARTIST_CREDIT],
          releaseYear: null,
          coverArtUrl: null,
          createdAt: null,
          confidenceScore: null,
          pendingTrackCount: 0,
        },
      ],
      total: 1,
    };
    expect(AlbumListResponseSchema.parse(valid)).toEqual(valid);
  });
});

describe("ArtistListResponseSchema", () => {
  it("parses a valid artist list response", () => {
    const valid = {
      items: [
        {
          id: "ar1",
          name: "Band",
          imageUrl: null,
          createdAt: null,
          albumCount: 0,
        },
      ],
      total: 1,
    };
    expect(ArtistListResponseSchema.parse(valid)).toEqual(valid);
  });
});

describe("PlaylistTrackSchema", () => {
  const valid = {
    entryId: "e1",
    trackId: "t1",
    title: "Song",
    artistName: null,
    albumTitle: null,
    albumId: "al1",
    coverArtUrl: null,
    durationSeconds: null,
    trackNumber: null,
    position: 0,
  };

  it("parses a valid playlist track", () => {
    expect(PlaylistTrackSchema.parse(valid)).toEqual(valid);
  });
});

describe("PlaylistDetailSchema", () => {
  it("parses a valid playlist detail with tracks", () => {
    const valid = {
      id: "p1",
      name: "Playlist",
      description: null,
      updatedAt: null,
      tracks: [],
    };
    expect(PlaylistDetailSchema.parse(valid)).toEqual(valid);
  });
});

describe("TrackStatusCountsSchema", () => {
  it("parses valid track status counts", () => {
    const valid = { pending: 1, resolving: 2, resolved: 3, failed: 0 };
    expect(TrackStatusCountsSchema.parse(valid)).toEqual(valid);
  });
});

describe("ScanProgressSchema", () => {
  it("parses a valid scan progress", () => {
    const valid = {
      running: false,
      scanned: 10,
      resolved: 8,
      failed: 1,
      inFlight: 1,
      total: null,
      startedAt: null,
      completedAt: null,
      counts: { pending: 0, resolving: 0, resolved: 8, failed: 1 },
    };
    expect(ScanProgressSchema.parse(valid)).toEqual(valid);
  });
});

describe("ServerSettingsSchema", () => {
  it("parses valid server settings", () => {
    const valid = { metadataConfidenceThreshold: 0.8 };
    expect(ServerSettingsSchema.parse(valid)).toEqual(valid);
  });
});

describe("DownloadRequestSchema", () => {
  it("parses a valid download request with string dates", () => {
    const now = new Date().toISOString();
    const result = DownloadRequestSchema.parse({
      id: "d1",
      releaseGroupMbid: "rg1",
      artistMbid: "ar1",
      artistName: "Artist",
      albumTitle: null,
      status: "requested",
      errorMessage: null,
      lidarrAlbumId: null,
      createdAt: now,
      updatedAt: now,
    });
    expect(typeof result.createdAt).toBe("string");
    expect(typeof result.updatedAt).toBe("string");
  });

  it("rejects an invalid download request status", () => {
    expect(() =>
      DownloadRequestSchema.parse({
        id: "d1",
        releaseGroupMbid: "rg1",
        artistMbid: "ar1",
        artistName: "Artist",
        albumTitle: null,
        status: "unknown_status",
        errorMessage: null,
        lidarrAlbumId: null,
        createdAt: null,
        updatedAt: null,
      }),
    ).toThrow(z.ZodError);
  });
});

describe("LidarrSettingsSchema", () => {
  it("parses valid lidarr settings", () => {
    const valid = {
      url: null,
      apiKeySet: false,
      qualityProfileId: null,
      metadataProfileId: null,
      rootFolderPath: null,
    };
    expect(LidarrSettingsSchema.parse(valid)).toEqual(valid);
  });
});

describe("LidarrOptionsSchema", () => {
  it("parses valid lidarr options", () => {
    const valid = {
      qualityProfiles: [{ id: 1, name: "Lossless" }],
      metadataProfiles: [],
      rootFolders: [{ id: 1, path: "/music" }],
    };
    expect(LidarrOptionsSchema.parse(valid)).toEqual(valid);
  });
});

describe("AlbumListItemSchema", () => {
  const valid = {
    id: "al1",
    title: "Album",
    artistId: "a1",
    artistName: "Artist",
    artists: [ALBUM_ARTIST_CREDIT],
    releaseYear: null,
    coverArtUrl: null,
    createdAt: null,
    confidenceScore: null,
    pendingTrackCount: 0,
  };

  it("parses a valid album list item", () => {
    expect(AlbumListItemSchema.parse(valid)).toEqual(valid);
  });
});

describe("ArtistSearchItemSchema", () => {
  it("parses a valid artist search item", () => {
    const valid = { id: "a1", name: "Artist", imageUrl: null };
    expect(ArtistSearchItemSchema.parse(valid)).toEqual(valid);
  });
});

describe("ArtistSchema", () => {
  it("parses a valid artist", () => {
    const valid = {
      id: "a1",
      name: "Artist",
      imageUrl: null,
      createdAt: null,
      albumCount: 3,
    };
    expect(ArtistSchema.parse(valid)).toEqual(valid);
  });

  it("rejects when albumCount is missing", () => {
    expect(() =>
      ArtistSchema.parse({ id: "a1", name: "Artist", imageUrl: null }),
    ).toThrow(z.ZodError);
  });
});

describe("SyncedLyricsLineSchema", () => {
  it("parses a valid synced lyrics line", () => {
    const valid = { startingTime: 1.5, lyrics: "Hello world" };
    expect(SyncedLyricsLineSchema.parse(valid)).toEqual(valid);
  });
});

describe("TrackLyricsSchema", () => {
  it("parses valid track lyrics", () => {
    const valid = {
      trackId: "t1",
      instrumental: false,
      plainLyrics: "Hello world",
      syncedLyrics: [{ startingTime: 1.5, lyrics: "Hello world" }],
    };
    expect(TrackLyricsSchema.parse(valid)).toEqual(valid);
  });

  it("accepts null syncedLyrics", () => {
    const valid = {
      trackId: "t1",
      instrumental: true,
      plainLyrics: null,
      syncedLyrics: null,
    };
    expect(TrackLyricsSchema.parse(valid)).toEqual(valid);
  });
});

describe("LibrarySearchResultsSchema", () => {
  it("parses valid library search results", () => {
    const valid = { artists: [], albums: [], tracks: [] };
    expect(LibrarySearchResultsSchema.parse(valid)).toEqual(valid);
  });

  it("rejects when artists array is missing", () => {
    expect(() =>
      LibrarySearchResultsSchema.parse({ albums: [], tracks: [] }),
    ).toThrow(z.ZodError);
  });
});

describe("recommendationsResponseSchema", () => {
  const schema = recommendationsResponseSchema(z.array(z.string()));

  it("parses no-token status", () => {
    expect(schema.parse({ status: "no-token" })).toEqual({
      status: "no-token",
    });
  });

  it("parses warming status", () => {
    expect(schema.parse({ status: "warming" })).toEqual({ status: "warming" });
  });

  it("parses ready status with data", () => {
    expect(schema.parse({ status: "ready", data: ["a", "b"] })).toEqual({
      status: "ready",
      data: ["a", "b"],
    });
  });

  it("parses error status with null data", () => {
    expect(schema.parse({ status: "error", data: null })).toEqual({
      status: "error",
      data: null,
    });
  });

  it("rejects an unknown status", () => {
    expect(() => schema.parse({ status: "unknown" })).toThrow(z.ZodError);
  });
});
