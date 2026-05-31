import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  createTestDb,
  seedAlbum,
  seedArtist,
  seedTrack,
} from "../__fixtures__/db.js";
import { tracks } from "../schema/tracks.js";
import { getAlbumsWithArtistDetails, searchAlbums } from "./albums.js";

let testDb: ReturnType<typeof createTestDb>;

vi.mock("../client.js", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("../../logger.js", () => ({
  logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}));

beforeEach(() => {
  testDb = createTestDb();
});

describe("getAlbumsWithArtistDetails — pendingTrackCount", () => {
  it("counts pending and resolving tracks for each album in one query", () => {
    const artistId = seedArtist("Burial");
    const albumA = seedAlbum(artistId, "Untrue");
    const albumB = seedAlbum(artistId, "Rival Dealer");

    // albumA: 2 resolving tracks (default from seedTrack)
    seedTrack(artistId, albumA, {
      title: "Archangel",
      filePath: "/music/a1.flac",
      trackNumber: 1,
    });
    seedTrack(artistId, albumA, {
      title: "Shell of Light",
      filePath: "/music/a2.flac",
      trackNumber: 2,
    });

    // albumB: 1 resolving, 1 resolved
    seedTrack(artistId, albumB, {
      title: "Rival Dealer",
      filePath: "/music/b1.flac",
      trackNumber: 1,
    });
    const resolvedId = seedTrack(artistId, albumB, {
      title: "Hiders",
      filePath: "/music/b2.flac",
      trackNumber: 2,
    });
    testDb
      .update(tracks)
      .set({ resolutionStatus: "resolved" })
      .where(eq(tracks.id, resolvedId))
      .run();

    const rows = getAlbumsWithArtistDetails({ limit: 10, offset: 0 });

    const rowA = rows.find((r) => r.id === albumA);
    const rowB = rows.find((r) => r.id === albumB);

    expect(rowA?.pendingTrackCount).toBe(2);
    expect(rowB?.pendingTrackCount).toBe(1);
  });

  it("returns 0 when all tracks are resolved or failed", () => {
    const artistId = seedArtist("Actress");
    const albumId = seedAlbum(artistId, "R.I.P.");

    const t1 = seedTrack(artistId, albumId, {
      filePath: "/music/c1.flac",
      trackNumber: 1,
    });
    const t2 = seedTrack(artistId, albumId, {
      filePath: "/music/c2.flac",
      trackNumber: 2,
    });
    testDb
      .update(tracks)
      .set({ resolutionStatus: "resolved" })
      .where(eq(tracks.id, t1))
      .run();
    testDb
      .update(tracks)
      .set({ resolutionStatus: "failed" })
      .where(eq(tracks.id, t2))
      .run();

    const rows = getAlbumsWithArtistDetails({ limit: 10, offset: 0 });
    const row = rows.find((r) => r.id === albumId);
    expect(row?.pendingTrackCount).toBe(0);
  });
});

describe("searchAlbums — pendingTrackCount", () => {
  it("counts pending and resolving tracks for search results", () => {
    const artistId = seedArtist("Portishead");
    const albumId = seedAlbum(artistId, "Dummy");

    seedTrack(artistId, albumId, {
      title: "Sour Times",
      filePath: "/music/d1.flac",
      trackNumber: 1,
    });
    seedTrack(artistId, albumId, {
      title: "Glory Box",
      filePath: "/music/d2.flac",
      trackNumber: 2,
    });

    const rows = searchAlbums("%Dummy%", 10);
    const row = rows.find((r) => r.id === albumId);
    expect(row?.pendingTrackCount).toBe(2);
  });

  it("returns 0 when all tracks are resolved", () => {
    const artistId = seedArtist("Massive Attack");
    const albumId = seedAlbum(artistId, "Mezzanine");

    const t1 = seedTrack(artistId, albumId, {
      filePath: "/music/e1.flac",
      trackNumber: 1,
    });
    testDb
      .update(tracks)
      .set({ resolutionStatus: "resolved" })
      .where(eq(tracks.id, t1))
      .run();

    const rows = searchAlbums("%Mezzanine%", 10);
    const row = rows.find((r) => r.id === albumId);
    expect(row?.pendingTrackCount).toBe(0);
  });
});
