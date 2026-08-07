import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTestDb,
  seedAlbum,
  seedArtist,
  seedPlaylist,
  seedTrack,
  seedUser,
} from "../db/__fixtures__/db.js";

let testDb: ReturnType<typeof createTestDb>;

vi.mock("../db/client.js", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("../coverart/store.js", () => ({
  resolveAlbumCoverNow: vi.fn(() => null),
}));

vi.mock("../config/server-config.js", () => ({
  serverConfig: { get: vi.fn(() => ({ lastfm: { apiKey: "k" } })) },
}));
vi.mock("../db/queries/playlist-suggestions-cache.js", () => ({
  getSuggestionRow: vi.fn(),
  upsertWarmingSuggestionRow: vi.fn(),
  markSuggestionStale: vi.fn(),
}));
vi.mock("../recommendations/in-library.js", () => ({
  refreshPlaylistTracksInLibrary: vi.fn((t) => t),
}));

import playlistRoutes from "./playlists.js";
import { buildApp } from "./__fixtures__/app.js";
import {
  getSuggestionRow,
  upsertWarmingSuggestionRow,
  markSuggestionStale,
} from "../db/queries/playlist-suggestions-cache.js";
import { serverConfig } from "../config/server-config.js";
import { resolveAlbumCoverNow } from "../coverart/store.js";

let userAId: string;
let userBId: string;
let playlistId: string;

beforeEach(() => {
  testDb = createTestDb();
  userAId = seedUser("alice");
  userBId = seedUser("bob");
  playlistId = seedPlaylist(userAId, "Alice's Playlist");
});

describe("GET / — sorting", () => {
  it("sorts playlists by name ascending when sort=title", async () => {
    seedPlaylist(userAId, "Zebra");
    seedPlaylist(userAId, "Apple");
    const app = buildApp(playlistRoutes, userAId);
    const res = await app.inject({ method: "GET", url: "/?sort=title" });
    expect(res.statusCode).toBe(200);
    const names = res.json().items.map((p: { name: string }) => p.name);
    // "Alice's Playlist" (seeded in beforeEach), "Apple", "Zebra"
    expect(names).toEqual(["Alice's Playlist", "Apple", "Zebra"]);
  });

  it("falls back to recently-added (200) for an invalid sort", async () => {
    const app = buildApp(playlistRoutes, userAId);
    const res = await app.inject({ method: "GET", url: "/?sort=bogus" });
    expect(res.statusCode).toBe(200);
    expect(res.json().total).toBe(1);
  });
});

describe("GET /:id — cross-user isolation", () => {
  it("returns 403 when requester is not the playlist owner", async () => {
    const app = buildApp(playlistRoutes, userBId);
    const res = await app.inject({ method: "GET", url: `/${playlistId}` });
    expect(res.statusCode).toBe(403);
  });

  it("returns 200 when requester is the playlist owner", async () => {
    const app = buildApp(playlistRoutes, userAId);
    const res = await app.inject({ method: "GET", url: `/${playlistId}` });
    expect(res.statusCode).toBe(200);
  });

  it("returns 404 for an unknown playlist id", async () => {
    const app = buildApp(playlistRoutes, userAId);
    const res = await app.inject({ method: "GET", url: "/nonexistent-id" });
    expect(res.statusCode).toBe(404);
  });
});

describe("GET /:id — detail shape", () => {
  it("includes coverArtUrls and per-track recordingMbid", async () => {
    vi.mocked(resolveAlbumCoverNow).mockImplementation(
      (row) => `url-${row.albumId}`,
    );
    const artistId = seedArtist();
    const albumId = seedAlbum(artistId);
    const trackId = seedTrack(artistId, albumId);
    const app = buildApp(playlistRoutes, userAId);
    await app.inject({
      method: "POST",
      url: `/${playlistId}/tracks`,
      payload: { trackIds: [trackId] },
    });

    const res = await app.inject({ method: "GET", url: `/${playlistId}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.coverArtUrls).toEqual([`url-${albumId}`]);
    expect(body.tracks[0]).toHaveProperty("recordingMbid");
    // fileExtension is the local extension the offline-download feature needs.
    expect(body.tracks[0].fileExtension).toBe("flac");
  });
});

describe("PUT /:id — cross-user isolation", () => {
  it("returns 403 when requester is not the playlist owner", async () => {
    const app = buildApp(playlistRoutes, userBId);
    const res = await app.inject({
      method: "PUT",
      url: `/${playlistId}`,
      payload: { name: "Hijacked" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("returns 200 when requester is the playlist owner", async () => {
    const app = buildApp(playlistRoutes, userAId);
    const res = await app.inject({
      method: "PUT",
      url: `/${playlistId}`,
      payload: { name: "Renamed" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe("Renamed");
  });
});

describe("DELETE /:id — cross-user isolation", () => {
  it("returns 403 when requester is not the playlist owner", async () => {
    const app = buildApp(playlistRoutes, userBId);
    const res = await app.inject({ method: "DELETE", url: `/${playlistId}` });
    expect(res.statusCode).toBe(403);
  });

  it("returns 204 when requester is the playlist owner", async () => {
    const app = buildApp(playlistRoutes, userAId);
    const res = await app.inject({ method: "DELETE", url: `/${playlistId}` });
    expect(res.statusCode).toBe(204);
  });
});

describe("POST /:id/tracks — cross-user isolation", () => {
  it("returns 403 when requester is not the playlist owner", async () => {
    const app = buildApp(playlistRoutes, userBId);
    const res = await app.inject({
      method: "POST",
      url: `/${playlistId}/tracks`,
      payload: { trackIds: ["some-track-id"] },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("DELETE /:id/tracks/:entryId — cross-user isolation", () => {
  it("returns 403 when requester is not the playlist owner", async () => {
    const app = buildApp(playlistRoutes, userBId);
    const res = await app.inject({
      method: "DELETE",
      url: `/${playlistId}/tracks/some-entry-id`,
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("GET / — list scoping", () => {
  it("returns only the requesting user's playlists", async () => {
    seedPlaylist(userBId, "Bob's Playlist");

    const app = buildApp(playlistRoutes, userAId);
    const res = await app.inject({ method: "GET", url: "/" });

    expect(res.statusCode).toBe(200);
    const { items } = res.json();
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe("Alice's Playlist");
  });
});

describe("GET / — cover art mosaic", () => {
  let artistId: string;

  beforeEach(() => {
    artistId = seedArtist();
    // Resolve each album to a stable, identifiable url so we can assert ranking.
    vi.mocked(resolveAlbumCoverNow).mockImplementation(
      (row) => `url-${row.albumId}`,
    );
  });

  // Adds `count` tracks belonging to `albumId` to the playlist, in order.
  async function addAlbumTracks(
    app: Awaited<ReturnType<typeof buildApp>>,
    albumId: string,
    count: number,
  ) {
    const trackIds = Array.from({ length: count }, (_, i) =>
      seedTrack(artistId, albumId, {
        filePath: `/music/${albumId}-${i}.flac`,
        trackNumber: i + 1,
        title: `T-${albumId}-${i}`,
      }),
    );
    await app.inject({
      method: "POST",
      url: `/${playlistId}/tracks`,
      payload: { trackIds },
    });
  }

  it("returns the top 4 cover arts ranked by track frequency", async () => {
    const app = buildApp(playlistRoutes, userAId);
    const a = seedAlbum(artistId, "Album A");
    const b = seedAlbum(artistId, "Album B");
    const c = seedAlbum(artistId, "Album C");
    const d = seedAlbum(artistId, "Album D");
    const e = seedAlbum(artistId, "Album E");
    // Frequencies: A=3, B=2, C=2, D=1, E=1. B/C tie broken by first appearance.
    await addAlbumTracks(app, a, 3);
    await addAlbumTracks(app, b, 2);
    await addAlbumTracks(app, c, 2);
    await addAlbumTracks(app, d, 1);
    await addAlbumTracks(app, e, 1);

    const res = await app.inject({ method: "GET", url: "/" });
    const item = res.json().items[0];
    expect(item.coverArtUrls).toEqual([
      `url-${a}`,
      `url-${b}`,
      `url-${c}`,
      `url-${d}`,
    ]);
  });

  it("returns a single cover when only one distinct album is present", async () => {
    const app = buildApp(playlistRoutes, userAId);
    const a = seedAlbum(artistId, "Solo Album");
    await addAlbumTracks(app, a, 3);

    const res = await app.inject({ method: "GET", url: "/" });
    expect(res.json().items[0].coverArtUrls).toEqual([`url-${a}`]);
  });

  it("returns an empty array for a playlist with no tracks", async () => {
    const app = buildApp(playlistRoutes, userAId);
    const res = await app.inject({ method: "GET", url: "/" });
    expect(res.json().items[0].coverArtUrls).toEqual([]);
  });

  it("skips cover-less albums and keeps filling up to 4", async () => {
    const app = buildApp(playlistRoutes, userAId);
    const a = seedAlbum(artistId, "Album A");
    const b = seedAlbum(artistId, "Album B");
    const c = seedAlbum(artistId, "Album C");
    const d = seedAlbum(artistId, "Album D");
    const e = seedAlbum(artistId, "Album E");
    // A is the most-shared but has no resolvable cover, so it's skipped.
    vi.mocked(resolveAlbumCoverNow).mockImplementation((row) =>
      row.albumId === a ? null : `url-${row.albumId}`,
    );
    await addAlbumTracks(app, a, 4);
    await addAlbumTracks(app, b, 3);
    await addAlbumTracks(app, c, 2);
    await addAlbumTracks(app, d, 1);
    await addAlbumTracks(app, e, 1);

    const res = await app.inject({ method: "GET", url: "/" });
    expect(res.json().items[0].coverArtUrls).toEqual([
      `url-${b}`,
      `url-${c}`,
      `url-${d}`,
      `url-${e}`,
    ]);
  });
});

describe("POST / — validation", () => {
  it("returns 400 when name is missing", async () => {
    const app = buildApp(playlistRoutes, userAId);
    const res = await app.inject({
      method: "POST",
      url: "/",
      payload: { description: "no name provided" },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("POST / — response shape", () => {
  it("returns 201 with PlaylistDetail-shaped body including tracks: []", async () => {
    const app = buildApp(playlistRoutes, userAId);
    const res = await app.inject({
      method: "POST",
      url: "/",
      payload: { name: "My New Playlist" },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.name).toBe("My New Playlist");
    expect(body.tracks).toEqual([]);
    expect(body).toHaveProperty("id");
    expect(body).toHaveProperty("description");
    expect(body).toHaveProperty("updatedAt");
  });
});

describe("PUT /:id — validation", () => {
  it("returns 400 on invalid body", async () => {
    const app = buildApp(playlistRoutes, userAId);
    const res = await app.inject({
      method: "PUT",
      url: `/${playlistId}`,
      payload: { name: 123 }, // name must be a string
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 200 and reflects updated description", async () => {
    const app = buildApp(playlistRoutes, userAId);
    const res = await app.inject({
      method: "PUT",
      url: `/${playlistId}`,
      payload: { description: "new desc" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().description).toBe("new desc");
  });

  it("returns 200 and sets description to null when explicitly nulled", async () => {
    const app = buildApp(playlistRoutes, userAId);
    const res = await app.inject({
      method: "PUT",
      url: `/${playlistId}`,
      payload: { description: null },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().description).toBeNull();
  });
});

describe("PUT /:id — response shape", () => {
  it("returns PlaylistDetail-shaped body with tracks: [] when playlist is empty", async () => {
    const app = buildApp(playlistRoutes, userAId);
    const res = await app.inject({
      method: "PUT",
      url: `/${playlistId}`,
      payload: { name: "Renamed Playlist" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.name).toBe("Renamed Playlist");
    expect(body.tracks).toEqual([]);
    expect(body).toHaveProperty("id");
    expect(body).toHaveProperty("description");
    expect(body).toHaveProperty("updatedAt");
  });

  it("returns tracks in response when playlist has tracks", async () => {
    const artistId = seedArtist();
    const albumId = seedAlbum(artistId);
    const trackId = seedTrack(artistId, albumId);
    const app = buildApp(playlistRoutes, userAId);

    await app.inject({
      method: "POST",
      url: `/${playlistId}/tracks`,
      payload: { trackIds: [trackId] },
    });

    const res = await app.inject({
      method: "PUT",
      url: `/${playlistId}`,
      payload: { name: "Renamed With Tracks" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.tracks).toHaveLength(1);
    expect(body.tracks[0].trackId).toBe(trackId);
  });
});

describe("POST /:id/tracks — validation", () => {
  it("returns 400 on invalid body", async () => {
    const app = buildApp(playlistRoutes, userAId);
    const res = await app.inject({
      method: "POST",
      url: `/${playlistId}/tracks`,
      payload: { notTrackIds: true },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when all provided track IDs do not exist", async () => {
    const app = buildApp(playlistRoutes, userAId);
    const res = await app.inject({
      method: "POST",
      url: `/${playlistId}/tracks`,
      payload: { trackIds: ["nonexistent-id"] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "no-valid-tracks" });
  });
});

describe("POST /:id/tracks — track existence filtering", () => {
  let artistId: string;
  let albumId: string;

  beforeEach(() => {
    artistId = seedArtist();
    albumId = seedAlbum(artistId);
  });

  it("returns 204 and adds the track when a valid track ID is provided", async () => {
    const trackId = seedTrack(artistId, albumId);
    const app = buildApp(playlistRoutes, userAId);
    const res = await app.inject({
      method: "POST",
      url: `/${playlistId}/tracks`,
      payload: { trackIds: [trackId] },
    });
    expect(res.statusCode).toBe(204);

    const listRes = await app.inject({ method: "GET", url: `/${playlistId}` });
    const tracks = listRes.json().tracks as Array<{ trackId: string }>;
    expect(tracks.map((t) => t.trackId)).toContain(trackId);
  });

  it("returns 204 and inserts only the valid track when mixed IDs are provided", async () => {
    const trackId = seedTrack(artistId, albumId);
    const app = buildApp(playlistRoutes, userAId);
    const res = await app.inject({
      method: "POST",
      url: `/${playlistId}/tracks`,
      payload: { trackIds: [trackId, "ghost-id"] },
    });
    expect(res.statusCode).toBe(204);

    const listRes = await app.inject({ method: "GET", url: `/${playlistId}` });
    const tracks = listRes.json().tracks as Array<{ trackId: string }>;
    expect(tracks).toHaveLength(1);
    expect(tracks.at(0)?.trackId).toBe(trackId);
  });

  it("returns 204 and inserts all tracks in a single batch when multiple valid IDs are provided", async () => {
    const trackId1 = seedTrack(artistId, albumId);
    const trackId2 = seedTrack(artistId, albumId);
    const trackId3 = seedTrack(artistId, albumId);
    const app = buildApp(playlistRoutes, userAId);
    const res = await app.inject({
      method: "POST",
      url: `/${playlistId}/tracks`,
      payload: { trackIds: [trackId1, trackId2, trackId3] },
    });
    expect(res.statusCode).toBe(204);

    const listRes = await app.inject({ method: "GET", url: `/${playlistId}` });
    const tracks = listRes.json().tracks as Array<{
      trackId: string;
      position: number;
    }>;
    expect(tracks).toHaveLength(3);
    expect(tracks.map((t) => t.trackId)).toEqual([
      trackId1,
      trackId2,
      trackId3,
    ]);
  });

  it("appends batch after existing tracks with correct positions", async () => {
    const trackId1 = seedTrack(artistId, albumId);
    const trackId2 = seedTrack(artistId, albumId);
    const trackId3 = seedTrack(artistId, albumId);
    const app = buildApp(playlistRoutes, userAId);

    await app.inject({
      method: "POST",
      url: `/${playlistId}/tracks`,
      payload: { trackIds: [trackId1] },
    });
    await app.inject({
      method: "POST",
      url: `/${playlistId}/tracks`,
      payload: { trackIds: [trackId2, trackId3] },
    });

    const listRes = await app.inject({ method: "GET", url: `/${playlistId}` });
    const tracks = listRes.json().tracks as Array<{ trackId: string }>;
    expect(tracks).toHaveLength(3);
    expect(tracks.map((t) => t.trackId)).toEqual([
      trackId1,
      trackId2,
      trackId3,
    ]);
  });
});

describe("GET /:id/suggestions", () => {
  it("404 when the playlist is unknown", async () => {
    const app = buildApp(playlistRoutes, userAId);
    const res = await app.inject({
      method: "GET",
      url: "/p-missing/suggestions",
    });
    expect(res.statusCode).toBe(404);
  });

  it("403 when the playlist belongs to another user", async () => {
    const app = buildApp(playlistRoutes, userBId);
    const res = await app.inject({
      method: "GET",
      url: `/${playlistId}/suggestions`,
    });
    expect(res.statusCode).toBe(403);
  });

  it("no-token when no Last.fm key is configured", async () => {
    vi.mocked(serverConfig.get).mockReturnValueOnce({
      lastfm: { apiKey: null },
    } as never);
    const app = buildApp(playlistRoutes, userAId);
    const res = await app.inject({
      method: "GET",
      url: `/${playlistId}/suggestions`,
    });
    expect(res.json()).toEqual({ status: "no-token" });
  });

  it("seeds a warming row and returns warming on first request", async () => {
    vi.mocked(getSuggestionRow).mockReturnValue(undefined);
    const app = buildApp(playlistRoutes, userAId);
    const res = await app.inject({
      method: "GET",
      url: `/${playlistId}/suggestions`,
    });
    expect(res.json()).toEqual({ status: "warming" });
    expect(upsertWarmingSuggestionRow).toHaveBeenCalledWith(
      userAId,
      playlistId,
    );
  });

  it("returns ready with the live in-library pass applied", async () => {
    vi.mocked(getSuggestionRow).mockReturnValue({
      status: "ready",
      payload: JSON.stringify([
        {
          recordingMbid: "m1",
          title: "T",
          artistName: "A",
          artistMbid: null,
          albumTitle: null,
          releaseGroupMbid: null,
          durationMs: null,
          coverArtUrl: null,
          inLibrary: false,
          localTrackId: null,
        },
      ]),
    } as never);
    const app = buildApp(playlistRoutes, userAId);
    const res = await app.inject({
      method: "GET",
      url: `/${playlistId}/suggestions`,
    });
    const body = res.json();
    expect(body.status).toBe("ready");
    expect(body.data).toHaveLength(1);
  });
});

describe("edit triggers mark suggestions stale", () => {
  it("POST /:id/tracks marks the row stale", async () => {
    const artistId = seedArtist();
    const albumId = seedAlbum(artistId);
    const trackId = seedTrack(artistId, albumId);
    const app = buildApp(playlistRoutes, userAId);
    await app.inject({
      method: "POST",
      url: `/${playlistId}/tracks`,
      payload: { trackIds: [trackId] },
    });
    expect(markSuggestionStale).toHaveBeenCalledWith(
      userAId,
      playlistId,
      expect.any(Number),
    );
  });

  it("DELETE /:id/tracks/:entryId marks the row stale", async () => {
    const artistId = seedArtist();
    const albumId = seedAlbum(artistId);
    const trackId = seedTrack(artistId, albumId);
    const app = buildApp(playlistRoutes, userAId);
    await app.inject({
      method: "POST",
      url: `/${playlistId}/tracks`,
      payload: { trackIds: [trackId] },
    });
    const listRes = await app.inject({ method: "GET", url: `/${playlistId}` });
    const entryId = (listRes.json().tracks as Array<{ entryId: string }>)[0]!
      .entryId;
    vi.mocked(markSuggestionStale).mockClear();

    await app.inject({
      method: "DELETE",
      url: `/${playlistId}/tracks/${entryId}`,
    });
    expect(markSuggestionStale).toHaveBeenCalledWith(
      userAId,
      playlistId,
      expect.any(Number),
    );
  });
});
