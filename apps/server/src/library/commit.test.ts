import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { commitResolution, isAutoCommit } from "./commit.js";
import { AUTO_COMMIT_THRESHOLD } from "./scoring.js";
import {
  makeCandidate,
  makeCredit,
  makeResolvedRelease,
  makeTags,
} from "./__fixtures__/builders.js";
import {
  createTestDb,
  seedAlbum,
  seedArtist,
  seedTrack,
} from "../db/__fixtures__/db.js";
import { getAlbumById } from "../db/queries/albums.js";
import { getArtistIdByMbid, getArtistRowById } from "../db/queries/artists.js";
import { listTrackArtists } from "../db/queries/track-artists.js";
import { db } from "../db/client.js";
import { tracks } from "../db/schema/tracks.js";
import { albums } from "../db/schema/albums.js";
import type { RecordingCandidate, ScoredCandidate } from "./types.js";

// --- Mocks ---
// db getter returns testDb so each test gets a fresh in-memory database.

let testDb: ReturnType<typeof createTestDb>;

vi.mock("../db/client.js", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("../coverart/store.js", () => ({
  ensureCoverOnDisk: vi.fn().mockResolvedValue(null),
}));
vi.mock("../artistimage/store.js", () => ({
  ensureArtistImageOnDisk: vi.fn().mockResolvedValue(null),
}));
vi.mock("../musicbrainz/client.js", async (importOriginal) => {
  const real =
    await importOriginal<typeof import("../musicbrainz/client.js")>();
  return { ...real, lookupReleaseDetails: vi.fn().mockResolvedValue(null) };
});

beforeEach(() => {
  testDb = createTestDb();
});

// --- Helpers ---

function makeWinner(
  overrides: Partial<RecordingCandidate> = {},
): ScoredCandidate {
  return { ...makeCandidate(overrides), score: 0.95 };
}

function getTrackRow(trackId: string) {
  return db.select().from(tracks).where(eq(tracks.id, trackId)).get();
}

function setAlbumFields(
  albumId: string,
  fields: Partial<typeof albums.$inferInsert>,
) {
  db.update(albums).set(fields).where(eq(albums.id, albumId)).run();
}

// --- Tests ---

describe("isAutoCommit", () => {
  it("returns true at exactly the threshold", () => {
    expect(isAutoCommit(AUTO_COMMIT_THRESHOLD)).toBe(true);
  });

  it("returns true above the threshold", () => {
    expect(isAutoCommit(1)).toBe(true);
  });

  it("returns false below the threshold", () => {
    expect(isAutoCommit(AUTO_COMMIT_THRESHOLD - 0.01)).toBe(false);
  });
});

describe("commitResolution — artist disambiguation", () => {
  it("uses the existing MBID-owning row when the MBID is already claimed", () => {
    const artistA = seedArtist("Artist A", "mbid-claimed");
    const localArtist = seedArtist("Local Artist");
    const albumId = seedAlbum(localArtist);
    const trackId = seedTrack(localArtist, albumId);

    commitResolution({
      trackId,
      currentArtistId: localArtist,
      currentAlbumId: albumId,
      winner: makeWinner({
        artistCredits: [makeCredit({ mbid: "mbid-claimed", name: "Artist A" })],
      }),
      release: makeResolvedRelease(),
      tags: makeTags(),
      audioFingerprint: null,
    });

    const track = getTrackRow(trackId);
    expect(track?.artistId).toBe(artistA);
  });

  it("adopts the local placeholder row when it is unclaimed and the name matches", () => {
    const localArtist = seedArtist("MF DOOM");
    const albumId = seedAlbum(localArtist);
    const trackId = seedTrack(localArtist, albumId);

    commitResolution({
      trackId,
      currentArtistId: localArtist,
      currentAlbumId: albumId,
      winner: makeWinner({
        artistCredits: [makeCredit({ mbid: "mbid-doom", name: "MF DOOM" })],
      }),
      release: makeResolvedRelease(),
      tags: makeTags(),
      audioFingerprint: null,
    });

    // The local row was adopted — track still points to same row id.
    const track = getTrackRow(trackId);
    expect(track?.artistId).toBe(localArtist);

    // And that row now carries the MBID.
    const localRow = getArtistRowById(localArtist);
    expect(localRow?.musicbrainzId).toBe("mbid-doom");
  });

  it("creates a new row for a co-credit whose name differs from the local placeholder", () => {
    // "MF DOOM" folder resolving an "MF Grimm" credit must not hijack the DOOM placeholder.
    const localArtist = seedArtist("MF DOOM");
    const albumId = seedAlbum(localArtist);
    const trackId = seedTrack(localArtist, albumId);

    commitResolution({
      trackId,
      currentArtistId: localArtist,
      currentAlbumId: albumId,
      winner: makeWinner({
        artistCredits: [makeCredit({ mbid: "mbid-grimm", name: "MF Grimm" })],
      }),
      release: makeResolvedRelease(),
      tags: makeTags(),
      audioFingerprint: null,
    });

    const track = getTrackRow(trackId);

    // Track now belongs to the newly-created Grimm row.
    expect(track?.artistId).not.toBe(localArtist);
    const grimmId = getArtistIdByMbid("mbid-grimm");
    expect(grimmId).toBeTruthy();
    expect(track?.artistId).toBe(grimmId);

    // Local DOOM row is still unclaimed.
    const localRow = getArtistRowById(localArtist);
    expect(localRow?.musicbrainzId).toBeNull();
  });
});

describe("commitResolution — album commit logic", () => {
  it("overwrites an unresolved album with a higher-confidence match", () => {
    const artistId = seedArtist("Artist", "mbid-b1");
    const albumId = seedAlbum(artistId);
    const trackId = seedTrack(artistId, albumId);

    commitResolution({
      trackId,
      currentArtistId: artistId,
      currentAlbumId: albumId,
      winner: makeWinner({
        artistCredits: [makeCredit({ mbid: "mbid-b1", name: "Artist" })],
      }),
      release: makeResolvedRelease({
        releaseMbid: "rel-new",
        title: "Resolved Title",
        confidence: 0.9,
      }),
      tags: makeTags(),
      audioFingerprint: null,
    });

    const album = getAlbumById(albumId);
    expect(album?.releaseMbid).toBe("rel-new");
    expect(album?.canonicalTitle).toBe("Resolved Title");
    expect(album?.confidenceScore).toBeCloseTo(0.9);
  });

  it("does not overwrite a higher-confidence album from a different release group", () => {
    const artistId = seedArtist("Artist", "mbid-b2");
    const albumId = seedAlbum(artistId);
    const trackId = seedTrack(artistId, albumId);

    // Establish a high-confidence identity on a different release group.
    setAlbumFields(albumId, {
      releaseMbid: "rel-established",
      releaseGroupMbid: "rg-established",
      confidenceScore: 0.95,
    });

    commitResolution({
      trackId,
      currentArtistId: artistId,
      currentAlbumId: albumId,
      winner: makeWinner({
        artistCredits: [makeCredit({ mbid: "mbid-b2", name: "Artist" })],
      }),
      release: makeResolvedRelease({
        releaseMbid: "rel-stray",
        releaseGroupMbid: "rg-different",
        confidence: 0.3,
      }),
      tags: makeTags(),
      audioFingerprint: null,
    });

    const album = getAlbumById(albumId);
    expect(album?.releaseMbid).toBe("rel-established");
    expect(album?.releaseGroupMbid).toBe("rg-established");
  });

  it("allows overwriting when the new commit refines the same release group", () => {
    const artistId = seedArtist("Artist", "mbid-b3");
    const albumId = seedAlbum(artistId);
    const trackId = seedTrack(artistId, albumId);

    setAlbumFields(albumId, {
      releaseMbid: "rel-old",
      releaseGroupMbid: "rg-same",
      confidenceScore: 0.95,
    });

    commitResolution({
      trackId,
      currentArtistId: artistId,
      currentAlbumId: albumId,
      winner: makeWinner({
        artistCredits: [makeCredit({ mbid: "mbid-b3", name: "Artist" })],
      }),
      release: makeResolvedRelease({
        releaseMbid: "rel-refined",
        releaseGroupMbid: "rg-same",
        confidence: 0.3,
      }),
      tags: makeTags(),
      audioFingerprint: null,
    });

    const album = getAlbumById(albumId);
    expect(album?.releaseMbid).toBe("rel-refined");
  });

  it("merges a duplicate album onto the canonical row that already owns the release MBID", () => {
    const artistId = seedArtist("Artist", "mbid-b4");
    // Canonical album already owns rel-canonical.
    const canonicalAlbum = seedAlbum(artistId, "Canonical Album");
    setAlbumFields(canonicalAlbum, {
      releaseMbid: "rel-canonical",
      confidenceScore: 0.9,
    });
    // Local duplicate was created before resolution.
    const localAlbum = seedAlbum(artistId, "Local Duplicate");
    const trackId = seedTrack(artistId, localAlbum);

    commitResolution({
      trackId,
      currentArtistId: artistId,
      currentAlbumId: localAlbum,
      winner: makeWinner({
        artistCredits: [makeCredit({ mbid: "mbid-b4", name: "Artist" })],
      }),
      release: makeResolvedRelease({
        releaseMbid: "rel-canonical",
        title: "Canonical Album",
        confidence: 0.9,
      }),
      tags: makeTags(),
      audioFingerprint: null,
    });

    // Track must have moved to the canonical album.
    const track = getTrackRow(trackId);
    expect(track?.albumId).toBe(canonicalAlbum);

    // Local duplicate must be gone.
    expect(getAlbumById(localAlbum)).toBeUndefined();
  });
});

describe("commitResolution — dominant artist recompute", () => {
  it("sets the album's artistId to the artist with the most resolved tracks", () => {
    // Artist A resolves 2 tracks, Artist B resolves 1 → Artist A should own the album.
    const localArtist = seedArtist("Artist A");
    const albumId = seedAlbum(localArtist);
    const track1 = seedTrack(localArtist, albumId, {
      filePath: "/m/t1.flac",
      trackNumber: 1,
    });
    const track2 = seedTrack(localArtist, albumId, {
      filePath: "/m/t2.flac",
      trackNumber: 2,
    });
    const track3 = seedTrack(localArtist, albumId, {
      filePath: "/m/t3.flac",
      trackNumber: 3,
    });

    const release = makeResolvedRelease({ releaseMbid: "rel-dominant" });

    for (const trackId of [track1, track2]) {
      commitResolution({
        trackId,
        currentArtistId: localArtist,
        currentAlbumId: albumId,
        winner: makeWinner({
          artistCredits: [makeCredit({ mbid: "mbid-a", name: "Artist A" })],
        }),
        release,
        tags: makeTags(),
        audioFingerprint: null,
      });
    }

    commitResolution({
      trackId: track3,
      currentArtistId: localArtist,
      currentAlbumId: albumId,
      winner: makeWinner({
        artistCredits: [makeCredit({ mbid: "mbid-b", name: "Artist B" })],
      }),
      release,
      tags: makeTags(),
      audioFingerprint: null,
    });

    // Artist A adopted the local placeholder and holds 2 resolved tracks.
    const album = getAlbumById(albumId);
    expect(album?.artistId).toBe(localArtist);
  });
});

describe("commitResolution — track artist credits", () => {
  it("writes a single credit to track_artists at position 0", () => {
    const artistId = seedArtist("Solo Artist", "mbid-solo");
    const albumId = seedAlbum(artistId);
    const trackId = seedTrack(artistId, albumId);

    commitResolution({
      trackId,
      currentArtistId: artistId,
      currentAlbumId: albumId,
      winner: makeWinner({
        artistCredits: [makeCredit({ mbid: "mbid-solo", name: "Solo Artist" })],
      }),
      release: null,
      tags: makeTags(),
      audioFingerprint: null,
    });

    const credits = listTrackArtists(trackId);
    expect(credits).toHaveLength(1);
    const track = getTrackRow(trackId);
    expect(credits[0]).toMatchObject({
      position: 0,
      joinPhrase: null,
      artistId: track?.artistId,
    });
  });

  it("writes all credits for a multi-artist track at correct positions", () => {
    const artistId = seedArtist("Lead Artist", "mbid-lead");
    const albumId = seedAlbum(artistId);
    const trackId = seedTrack(artistId, albumId);

    commitResolution({
      trackId,
      currentArtistId: artistId,
      currentAlbumId: albumId,
      winner: makeWinner({
        artistCredits: [
          makeCredit({
            mbid: "mbid-lead",
            name: "Lead Artist",
            joinPhrase: " feat. ",
          }),
          makeCredit({
            mbid: "mbid-feat",
            name: "Featured Artist",
            joinPhrase: null,
          }),
        ],
      }),
      release: null,
      tags: makeTags(),
      audioFingerprint: null,
    });

    const credits = listTrackArtists(trackId);
    expect(credits).toHaveLength(2);

    const track = getTrackRow(trackId);
    // Position 0 uses the identity-stable leadArtistId (same row as track.artistId).
    expect(credits[0]).toMatchObject({
      position: 0,
      joinPhrase: " feat. ",
      artistId: track?.artistId,
    });
    // Position 1 is a distinct row for the featured artist.
    expect(credits[1]).toMatchObject({ position: 1, joinPhrase: null });
    expect(credits[1]!.artistId).not.toBe(track?.artistId);
  });

  it("replaces credits on a second commit rather than appending", () => {
    const artistId = seedArtist("Lead Artist", "mbid-lead2");
    const albumId = seedAlbum(artistId);
    const trackId = seedTrack(artistId, albumId);

    const baseInput = {
      trackId,
      currentArtistId: artistId,
      currentAlbumId: albumId,
      release: null,
      tags: makeTags(),
      audioFingerprint: null,
    };

    // First commit: two credits.
    commitResolution({
      ...baseInput,
      winner: makeWinner({
        artistCredits: [
          makeCredit({ mbid: "mbid-lead2", name: "Lead Artist" }),
          makeCredit({ mbid: "mbid-guest", name: "Guest Artist" }),
        ],
      }),
    });

    // Second commit: one credit — must replace, not append.
    commitResolution({
      ...baseInput,
      currentArtistId: getTrackRow(trackId)!.artistId,
      winner: makeWinner({
        artistCredits: [
          makeCredit({ mbid: "mbid-lead2", name: "Lead Artist" }),
        ],
      }),
    });

    const credits = listTrackArtists(trackId);
    expect(credits).toHaveLength(1);
    expect(credits[0]!.position).toBe(0);
  });
});
