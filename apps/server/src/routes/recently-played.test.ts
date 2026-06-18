import { describe, it, expect, vi, beforeEach } from "vitest";
import recentlyPlayedRoutes from "./recently-played.js";
import { buildApp } from "./__fixtures__/app.js";
import { getRecentlyPlayedSources } from "../db/queries/listening-history.js";
import { getAlbumWithArtistDetails } from "../db/queries/albums.js";
import {
  getPlaylist,
  getPlaylistTrackCounts,
  getPlaylistCoverArtUrls,
} from "../db/queries/playlists.js";
import { resolveAlbumCoverNow } from "../coverart/store.js";

vi.mock("../db/queries/listening-history.js");
vi.mock("../db/queries/albums.js");
vi.mock("../db/queries/playlists.js");
vi.mock("../coverart/store.js");

function albumRow(id: string, title: string) {
  return {
    id,
    title,
    artistId: "ar-1",
    artistName: "Fleetwood Mac",
    releaseYear: 1977,
    releaseMbid: null,
    releaseGroupMbid: null,
    coverArtUrl: null,
    createdAt: new Date(),
    confidenceScore: null,
    pendingTrackCount: 0,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveAlbumCoverNow).mockReturnValue(null);
  vi.mocked(getPlaylistTrackCounts).mockReturnValue([
    { playlistId: "pl-1", trackCount: 5 },
  ]);
  vi.mocked(getPlaylistCoverArtUrls).mockReturnValue([]);
});

describe("GET /api/recently-played", () => {
  it("interleaves albums and playlists in the order the sources are returned", async () => {
    vi.mocked(getRecentlyPlayedSources).mockReturnValue([
      { sourceType: "album", sourceId: "al-1", lastListenedAtMs: 300_000 },
      { sourceType: "playlist", sourceId: "pl-1", lastListenedAtMs: 200_000 },
    ]);
    vi.mocked(getAlbumWithArtistDetails).mockReturnValue(
      albumRow("al-1", "Rumours"),
    );
    vi.mocked(getPlaylist).mockReturnValue({
      id: "pl-1",
      userId: "user-1",
      name: "Late Nights",
      description: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const app = buildApp(recentlyPlayedRoutes, "user-1");
    const res = await app.inject({ method: "GET", url: "/" });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items).toMatchObject([
      { kind: "album", id: "al-1", title: "Rumours", lastPlayedAt: 300_000 },
      { kind: "playlist", id: "pl-1", name: "Late Nights", trackCount: 5 },
    ]);
  });

  it("drops an album source that no longer resolves", async () => {
    vi.mocked(getRecentlyPlayedSources).mockReturnValue([
      { sourceType: "album", sourceId: "gone", lastListenedAtMs: 300_000 },
      { sourceType: "album", sourceId: "al-1", lastListenedAtMs: 200_000 },
    ]);
    vi.mocked(getAlbumWithArtistDetails).mockImplementation((id) =>
      id === "al-1" ? albumRow("al-1", "Rumours") : undefined,
    );

    const app = buildApp(recentlyPlayedRoutes, "user-1");
    const res = await app.inject({ method: "GET", url: "/" });

    expect(res.json().items).toMatchObject([{ kind: "album", id: "al-1" }]);
  });

  it("drops a playlist not owned by the requesting user", async () => {
    vi.mocked(getRecentlyPlayedSources).mockReturnValue([
      { sourceType: "playlist", sourceId: "pl-1", lastListenedAtMs: 200_000 },
    ]);
    vi.mocked(getPlaylist).mockReturnValue({
      id: "pl-1",
      userId: "someone-else",
      name: "Theirs",
      description: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const app = buildApp(recentlyPlayedRoutes, "user-1");
    const res = await app.inject({ method: "GET", url: "/" });

    expect(res.json().items).toEqual([]);
  });
});
