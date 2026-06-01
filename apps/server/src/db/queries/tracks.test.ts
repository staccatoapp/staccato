import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import {
  createTestDb,
  seedAlbum,
  seedArtist,
  seedTrack,
} from "../__fixtures__/db.js";
import { tracks } from "../schema/tracks.js";
import { albums } from "../schema/albums.js";
import { artists } from "../schema/artists.js";

let testDb: ReturnType<typeof createTestDb>;

vi.mock("../client.js", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("../../logger.js", () => ({
  logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}));

import { deleteTrackById } from "./tracks.js";

beforeEach(() => {
  testDb = createTestDb();
});

const trackRow = (id: string) =>
  testDb.select().from(tracks).where(eq(tracks.id, id)).get();

const albumRow = (id: string) =>
  testDb.select().from(albums).where(eq(albums.id, id)).get();

const artistRow = (id: string) =>
  testDb.select().from(artists).where(eq(artists.id, id)).get();

const ftsRow = (trackId: string) =>
  testDb.get<{ track_id: string }>(
    sql`SELECT track_id FROM tracks_fts WHERE track_id = ${trackId}`,
  );

describe("deleteTrackById", () => {
  it("removes the track row and its FTS entry", () => {
    const artistId = seedArtist("Artist A");
    const albumId = seedAlbum(artistId);
    const trackId = seedTrack(artistId, albumId, { filePath: "/m/1.flac" });

    expect(trackRow(trackId)).toBeDefined();
    expect(ftsRow(trackId)).toBeDefined();

    deleteTrackById(trackId);

    expect(trackRow(trackId)).toBeUndefined();
    expect(ftsRow(trackId)).toBeUndefined();
  });

  it("cascades to delete the album when it was the last track", () => {
    const artistId = seedArtist("Artist A");
    const albumId = seedAlbum(artistId);
    const trackId = seedTrack(artistId, albumId, { filePath: "/m/2.flac" });

    deleteTrackById(trackId);

    expect(albumRow(albumId)).toBeUndefined();
  });

  it("does not delete the album when other tracks remain", () => {
    const artistId = seedArtist("Artist A");
    const albumId = seedAlbum(artistId);
    const trackId1 = seedTrack(artistId, albumId, { filePath: "/m/3a.flac" });
    const trackId2 = seedTrack(artistId, albumId, {
      filePath: "/m/3b.flac",
      trackNumber: 2,
    });

    deleteTrackById(trackId1);

    expect(trackRow(trackId2)).toBeDefined();
    expect(albumRow(albumId)).toBeDefined();
  });

  it("cascades to delete the artist when no tracks or albums remain", () => {
    const artistId = seedArtist("Artist A");
    const albumId = seedAlbum(artistId);
    const trackId = seedTrack(artistId, albumId, { filePath: "/m/4.flac" });

    deleteTrackById(trackId);

    expect(artistRow(artistId)).toBeUndefined();
  });

  it("does not delete the artist when they have other tracks", () => {
    const artistId = seedArtist("Artist A");
    const albumId = seedAlbum(artistId);
    const trackId1 = seedTrack(artistId, albumId, { filePath: "/m/5a.flac" });
    seedTrack(artistId, albumId, { filePath: "/m/5b.flac", trackNumber: 2 });

    deleteTrackById(trackId1);

    expect(artistRow(artistId)).toBeDefined();
  });

  it("does nothing when called with a non-existent ID", () => {
    const artistId = seedArtist("Artist A");
    const albumId = seedAlbum(artistId);
    seedTrack(artistId, albumId, { filePath: "/m/6.flac" });

    expect(() => deleteTrackById("non-existent-id")).not.toThrow();

    const remaining = testDb.select().from(tracks).all();
    expect(remaining).toHaveLength(1);
  });
});
