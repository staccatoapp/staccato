import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  createTestDb,
  seedAlbum,
  seedArtist,
  seedTrack,
} from "../__fixtures__/db.js";
import { trackArtists } from "../schema/track-artists.js";

let testDb: ReturnType<typeof createTestDb>;

vi.mock("../client.js", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("../../logger.js", () => ({
  logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}));

import { replaceTrackArtists } from "./track-artists.js";

beforeEach(() => {
  testDb = createTestDb();
});

describe("replaceTrackArtists", () => {
  it("inserts credits when none existed before", () => {
    const artistId = seedArtist("Artist A");
    const albumId = seedAlbum(artistId);
    const trackId = seedTrack(artistId, albumId, { filePath: "/m/1.flac" });

    replaceTrackArtists(trackId, [{ artistId, position: 0, joinPhrase: null }]);

    const rows = testDb
      .select()
      .from(trackArtists)
      .where(eq(trackArtists.trackId, trackId))
      .all();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.artistId).toBe(artistId);
    expect(rows[0]!.position).toBe(0);
    expect(rows[0]!.joinPhrase).toBeNull();
  });

  it("replaces existing credits with new ones", () => {
    const artistA = seedArtist("Artist A");
    const artistB = seedArtist("Artist B");
    const albumId = seedAlbum(artistA);
    const trackId = seedTrack(artistA, albumId, { filePath: "/m/2.flac" });

    replaceTrackArtists(trackId, [
      { artistId: artistA, position: 0, joinPhrase: null },
    ]);

    replaceTrackArtists(trackId, [
      { artistId: artistB, position: 0, joinPhrase: null },
      { artistId: artistA, position: 1, joinPhrase: " feat. " },
    ]);

    const rows = testDb
      .select()
      .from(trackArtists)
      .where(eq(trackArtists.trackId, trackId))
      .all();
    expect(rows).toHaveLength(2);
    const positions = rows.map((r) => r.position).sort();
    expect(positions).toEqual([0, 1]);
    const featureRow = rows.find((r) => r.artistId === artistA);
    expect(featureRow?.joinPhrase).toBe(" feat. ");
  });

  it("clears all credits when passed an empty array", () => {
    const artistId = seedArtist("Artist A");
    const albumId = seedAlbum(artistId);
    const trackId = seedTrack(artistId, albumId, { filePath: "/m/3.flac" });

    replaceTrackArtists(trackId, [{ artistId, position: 0, joinPhrase: null }]);

    replaceTrackArtists(trackId, []);

    const rows = testDb
      .select()
      .from(trackArtists)
      .where(eq(trackArtists.trackId, trackId))
      .all();
    expect(rows).toHaveLength(0);
  });
});
