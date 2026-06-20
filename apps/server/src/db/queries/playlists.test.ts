import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTestDb,
  seedAlbum,
  seedArtist,
  seedPlaylist,
  seedTrack,
  seedUser,
} from "../__fixtures__/db.js";
import { playlistTracks } from "../schema/playlist-tracks.js";

let testDb: ReturnType<typeof createTestDb>;

vi.mock("../client.js", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("../../logger.js", () => ({
  logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}));

import {
  addTrackToPlaylist,
  getMaxPlaylistTrackPosition,
  getPlaylistTracks,
} from "./playlists.js";

let userId: string;
let playlistId: string;
let artistId: string;
let albumId: string;

beforeEach(() => {
  testDb = createTestDb();
  userId = seedUser();
  playlistId = seedPlaylist(userId);
  artistId = seedArtist();
  albumId = seedAlbum(artistId);
});

describe("addTrackToPlaylist — position assignment", () => {
  it("assigns position 0 to the first track", () => {
    const trackId = seedTrack(artistId, albumId, { filePath: "/m/1.flac" });
    addTrackToPlaylist(playlistId, trackId, 0);
    expect(getMaxPlaylistTrackPosition(playlistId)).toBe(0);
  });

  it("assigns sequential positions when multiple tracks are added", () => {
    const track1 = seedTrack(artistId, albumId, { filePath: "/m/1.flac" });
    const track2 = seedTrack(artistId, albumId, { filePath: "/m/2.flac" });
    const track3 = seedTrack(artistId, albumId, { filePath: "/m/3.flac" });
    addTrackToPlaylist(playlistId, track1, 0);
    addTrackToPlaylist(playlistId, track2, 1);
    addTrackToPlaylist(playlistId, track3, 2);

    const rows = testDb.select().from(playlistTracks).all();
    const positions = rows.map((r) => r.position).sort((a, b) => a - b);
    expect(positions).toEqual([0, 1, 2]);
  });

  it("allows the same track to appear more than once (duplicate tracks are permitted)", () => {
    const trackId = seedTrack(artistId, albumId, { filePath: "/m/1.flac" });
    addTrackToPlaylist(playlistId, trackId, 0);
    addTrackToPlaylist(playlistId, trackId, 1);

    const rows = testDb
      .select()
      .from(playlistTracks)
      .all()
      .filter((r) => r.trackId === trackId);
    expect(rows).toHaveLength(2);
  });
});

describe("getPlaylistTracks — fileExtension", () => {
  it("derives the extension from the source file path, not the codec label", () => {
    const trackId = seedTrack(artistId, albumId, {
      filePath: "/music/song.m4a",
    });
    addTrackToPlaylist(playlistId, trackId, 0);

    const [track] = getPlaylistTracks(playlistId);

    expect(track?.fileExtension).toBe("m4a");
  });

  it("returns null when the source path has no extension", () => {
    const trackId = seedTrack(artistId, albumId, { filePath: "/music/noext" });
    addTrackToPlaylist(playlistId, trackId, 0);

    const [track] = getPlaylistTracks(playlistId);

    expect(track?.fileExtension).toBeNull();
  });

  it("does not leak the server file path", () => {
    const trackId = seedTrack(artistId, albumId, {
      filePath: "/music/song.mp3",
    });
    addTrackToPlaylist(playlistId, trackId, 0);

    const [track] = getPlaylistTracks(playlistId);

    expect(track).not.toHaveProperty("filePath");
  });
});

describe("playlist_tracks unique position constraint", () => {
  it("throws when inserting duplicate (playlist_id, position)", () => {
    const trackId1 = seedTrack(artistId, albumId, { filePath: "/m/1.flac" });
    const trackId2 = seedTrack(artistId, albumId, { filePath: "/m/2.flac" });
    addTrackToPlaylist(playlistId, trackId1, 0);

    expect(() => addTrackToPlaylist(playlistId, trackId2, 0)).toThrow();
  });

  it("allows the same position in different playlists", () => {
    const otherPlaylistId = seedPlaylist(userId, "Other Playlist");
    const trackId = seedTrack(artistId, albumId, { filePath: "/m/1.flac" });

    addTrackToPlaylist(playlistId, trackId, 0);
    expect(() => addTrackToPlaylist(otherPlaylistId, trackId, 0)).not.toThrow();
  });
});
