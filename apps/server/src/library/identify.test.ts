import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyBaseLogger } from "fastify";
import { eq } from "drizzle-orm";
import { confirmAlbumMatch, applyAlbumIdentification } from "./identify.js";
import {
  createTestDb,
  seedArtist,
  seedAlbum,
  seedTrack,
  type TestDb,
} from "../db/__fixtures__/db.js";
import { getAlbumById } from "../db/queries/albums.js";
import { db } from "../db/client.js";
import { tracks } from "../db/schema/tracks.js";
import { albums } from "../db/schema/albums.js";
import { lookupReleaseDetails } from "../musicbrainz/client.js";
import type { MBReleaseDetails } from "../musicbrainz/client.js";

// --- Mocks ---

let testDb: TestDb;

vi.mock("../db/client.js", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("../musicbrainz/client.js", async (importOriginal) => {
  const real =
    await importOriginal<typeof import("../musicbrainz/client.js")>();
  return { ...real, lookupReleaseDetails: vi.fn().mockResolvedValue(null) };
});

vi.mock("../coverart/store.js", () => ({
  ensureCoverOnDisk: vi.fn().mockResolvedValue(null),
}));

const mockLookupReleaseDetails = vi.mocked(lookupReleaseDetails);

beforeEach(() => {
  testDb = createTestDb();
  mockLookupReleaseDetails.mockReset();
});

// --- Helpers ---

const log = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
} as unknown as FastifyBaseLogger;

function makeReleaseDetails(
  overrides: Partial<MBReleaseDetails> = {},
): MBReleaseDetails {
  return {
    releaseName: "Test Release",
    disambiguation: null,
    releaseYear: 2020,
    artistMbid: "artist-mbid",
    artistName: "Test Artist",
    releaseGroupMbid: "rg-test",
    artistCredits: [],
    tracks: [],
    ...overrides,
  };
}

// --- confirmAlbumMatch ---

describe("confirmAlbumMatch", () => {
  it("returns not_found when album does not exist", async () => {
    const result = await confirmAlbumMatch("nonexistent-id", log);
    expect(result).toEqual({ ok: false, reason: "not_found" });
  });

  it("sets confidence to 1.0 and marks all tracks resolved/manual", async () => {
    const artistId = seedArtist("The Artist");
    const albumId = seedAlbum(artistId);
    const track1 = seedTrack(artistId, albumId, {
      filePath: "/m/t1.flac",
      trackNumber: 1,
    });
    const track2 = seedTrack(artistId, albumId, {
      filePath: "/m/t2.flac",
      trackNumber: 2,
    });

    const result = await confirmAlbumMatch(albumId, log);

    expect(result).toEqual({ ok: true, albumId, confirmed: 2 });

    const album = getAlbumById(albumId);
    expect(album?.confidenceScore).toBeCloseTo(1.0);

    for (const trackId of [track1, track2]) {
      const row = db
        .select({
          resolutionStatus: tracks.resolutionStatus,
          resolutionMethod: tracks.resolutionMethod,
          confidenceScore: tracks.confidenceScore,
        })
        .from(tracks)
        .where(eq(tracks.id, trackId))
        .get();
      expect(row?.resolutionStatus).toBe("resolved");
      expect(row?.resolutionMethod).toBe("manual");
      expect(row?.confidenceScore).toBeCloseTo(1.0);
    }
  });
});

// --- applyAlbumIdentification ---

describe("applyAlbumIdentification", () => {
  it("returns not_found when album does not exist", async () => {
    const result = await applyAlbumIdentification(
      "nonexistent-id",
      "rel-mbid",
      null,
      [],
      log,
    );
    expect(result).toEqual({ ok: false, reason: "not_found" });
  });

  it("returns mb_lookup_failed when lookupReleaseDetails returns null", async () => {
    const artistId = seedArtist("Artist");
    const albumId = seedAlbum(artistId);
    mockLookupReleaseDetails.mockResolvedValueOnce(null);

    const result = await applyAlbumIdentification(
      albumId,
      "rel-mbid",
      null,
      [],
      log,
    );
    expect(result).toEqual({ ok: false, reason: "mb_lookup_failed" });
  });

  it("pairs tracks by (disc, track) position and updates album metadata", async () => {
    const artistId = seedArtist("Artist");
    const albumId = seedAlbum(artistId);
    const track1 = seedTrack(artistId, albumId, {
      filePath: "/m/t1.flac",
      trackNumber: 1,
    });
    const track2 = seedTrack(artistId, albumId, {
      filePath: "/m/t2.flac",
      trackNumber: 2,
    });
    // Track 3 has no matching MB candidate — should be left unchanged.
    const track3 = seedTrack(artistId, albumId, {
      filePath: "/m/t3.flac",
      trackNumber: 3,
    });

    mockLookupReleaseDetails.mockResolvedValueOnce(
      makeReleaseDetails({
        releaseName: "New Title",
        releaseGroupMbid: "rg-new",
        tracks: [
          {
            discPosition: 1,
            trackPosition: 1,
            recordingMbid: "rec-1",
            title: "Track One",
            durationMs: 200_000,
          },
          {
            discPosition: 1,
            trackPosition: 2,
            recordingMbid: "rec-2",
            title: "Track Two",
            durationMs: 220_000,
          },
          // No entry for trackPosition 3 — track3 should be untouched.
        ],
      }),
    );

    const result = await applyAlbumIdentification(
      albumId,
      "rel-new",
      null,
      [],
      log,
    );

    expect(result).toMatchObject({
      ok: true,
      albumId,
      releaseMbid: "rel-new",
      title: "New Title",
      remapped: 2,
      adopted: 0,
      total: 3,
    });

    const album = getAlbumById(albumId);
    expect(album?.releaseMbid).toBe("rel-new");
    expect(album?.releaseGroupMbid).toBe("rg-new");
    expect(album?.canonicalTitle).toBe("New Title");
    expect(album?.confidenceScore).toBeCloseTo(1.0);

    const t1 = db.select().from(tracks).where(eq(tracks.id, track1)).get();
    expect(t1?.musicbrainzId).toBe("rec-1");
    expect(t1?.canonicalTitle).toBe("Track One");
    expect(t1?.resolutionStatus).toBe("resolved");
    expect(t1?.resolutionMethod).toBe("manual");

    const t2 = db.select().from(tracks).where(eq(tracks.id, track2)).get();
    expect(t2?.musicbrainzId).toBe("rec-2");
    expect(t2?.canonicalTitle).toBe("Track Two");

    // Track 3 has no MB candidate — musicbrainzId stays null.
    const t3 = db.select().from(tracks).where(eq(tracks.id, track3)).get();
    expect(t3?.musicbrainzId).toBeNull();
  });

  it("adopts orphan tracks and deletes the emptied source album", async () => {
    const artistA = seedArtist("Artist A");
    const targetAlbumId = seedAlbum(artistA, "Target Album");

    const artistB = seedArtist("Artist B");
    const sourceAlbumId = seedAlbum(artistB, "Source Album");
    const orphanTrackId = seedTrack(artistB, sourceAlbumId, {
      filePath: "/m/orphan.flac",
      trackNumber: 1,
    });

    mockLookupReleaseDetails.mockResolvedValueOnce(
      makeReleaseDetails({
        tracks: [
          {
            discPosition: 1,
            trackPosition: 1,
            recordingMbid: "rec-adopted",
            title: "Adopted Track",
            durationMs: 180_000,
          },
        ],
      }),
    );

    const result = await applyAlbumIdentification(
      targetAlbumId,
      "rel-target",
      null,
      [orphanTrackId],
      log,
    );

    expect(result).toMatchObject({ ok: true, adopted: 1, remapped: 1 });

    // Orphan track moved to targetAlbum and re-artistted.
    const adopted = db
      .select()
      .from(tracks)
      .where(eq(tracks.id, orphanTrackId))
      .get();
    expect(adopted?.albumId).toBe(targetAlbumId);
    expect(adopted?.artistId).toBe(artistA);

    // Source album is now empty — deleteOrphanAlbums should have removed it.
    const deadAlbum = db
      .select()
      .from(albums)
      .where(eq(albums.id, sourceAlbumId))
      .get();
    expect(deadAlbum).toBeUndefined();
  });
});
