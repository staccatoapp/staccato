import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import {
  createTestDb,
  seedAlbum,
  seedArtist,
  seedTrack,
} from "../__fixtures__/db.js";
import { tracks } from "../schema/tracks.js";
import { artists } from "../schema/artists.js";
import { trackArtists } from "../schema/track-artists.js";
import { albumArtists } from "../schema/album-artists.js";
import type { AlbumEditRequest, AlbumEditTrack } from "@staccato/shared";

let testDb: ReturnType<typeof createTestDb>;

// The `get db()` getter defers access until runtime, so it returns whichever
// testDb the current beforeEach assigned. vi.mock is hoisted above the imports.
vi.mock("../client.js", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("../../logger.js", () => ({
  logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}));

import { applyAlbumEdit } from "./album-edit.js";
import { getAlbumById } from "./albums.js";
import { updateTrackByTrackId } from "./tracks.js";

beforeEach(() => {
  testDb = createTestDb();
});

function editTrack(
  trackId: string,
  over: Partial<AlbumEditTrack> = {},
): AlbumEditTrack {
  return {
    trackId,
    title: over.title ?? "Edited Track",
    trackNumber: over.trackNumber ?? 1,
    discNumber: over.discNumber ?? 1,
    artists: over.artists ?? [
      { name: "Original Artist", joinPhrase: null, position: 0 },
    ],
  };
}

function payload(over: Partial<AlbumEditRequest> = {}): AlbumEditRequest {
  return {
    title: over.title ?? "Original Album",
    artistName: over.artistName ?? "Original Artist",
    releaseYear: over.releaseYear ?? 2000,
    coverArtUrl: over.coverArtUrl ?? null,
    tracks: over.tracks ?? [],
  };
}

const trackRow = (id: string) =>
  testDb.select().from(tracks).where(eq(tracks.id, id)).get();

describe("applyAlbumEdit", () => {
  it("updates album fields (canonicalTitle, releaseYear, cover, artist)", () => {
    const artistId = seedArtist("Original Artist");
    const albumId = seedAlbum(artistId, "Original Album", 2000);
    const t1 = seedTrack(artistId, albumId, { filePath: "/m/1.flac" });

    applyAlbumEdit(
      albumId,
      payload({
        title: "Brand New Title",
        artistName: "Brand New Artist",
        releaseYear: 2024,
        coverArtUrl: "/metadata/covers/album-x.jpg",
        tracks: [editTrack(t1)],
      }),
    );

    const album = getAlbumById(albumId)!;
    expect(album.canonicalTitle).toBe("Brand New Title");
    expect(album.releaseYear).toBe(2024);
    expect(album.coverArtUrl).toBe("/metadata/covers/album-x.jpg");

    const newArtist = testDb
      .select()
      .from(artists)
      .where(eq(artists.id, album.artistId))
      .get()!;
    expect(newArtist.name).toBe("Brand New Artist");
  });

  it("writes a single primary album-artist credit", () => {
    const artistId = seedArtist("Original Artist");
    const albumId = seedAlbum(artistId, "Original Album");
    const t1 = seedTrack(artistId, albumId, { filePath: "/m/1.flac" });

    applyAlbumEdit(
      albumId,
      payload({ artistName: "Solo Act", tracks: [editTrack(t1)] }),
    );

    const credits = testDb
      .select()
      .from(albumArtists)
      .where(eq(albumArtists.albumId, albumId))
      .all();
    expect(credits).toHaveLength(1);
    expect(credits[0]!.position).toBe(0);
    expect(credits[0]!.isPrimary).toBe(true);
  });

  it("updates per-track title, number and disc", () => {
    const artistId = seedArtist("Original Artist");
    const albumId = seedAlbum(artistId, "Original Album");
    const t1 = seedTrack(artistId, albumId, { filePath: "/m/1.flac" });

    applyAlbumEdit(
      albumId,
      payload({
        tracks: [
          editTrack(t1, { title: "Renamed", trackNumber: 7, discNumber: 2 }),
        ],
      }),
    );

    const row = trackRow(t1)!;
    expect(row.canonicalTitle).toBe("Renamed");
    expect(row.trackNumber).toBe(7);
    expect(row.discNumber).toBe(2);
  });

  it("resolves credits, creating a brand-new artist row", () => {
    const artistId = seedArtist("Original Artist");
    const albumId = seedAlbum(artistId, "Original Album");
    const t1 = seedTrack(artistId, albumId, { filePath: "/m/1.flac" });

    applyAlbumEdit(
      albumId,
      payload({
        tracks: [
          editTrack(t1, {
            artists: [
              { name: "Lead Person", joinPhrase: " feat. ", position: 0 },
              { name: "Newcomer XYZ", joinPhrase: null, position: 1 },
            ],
          }),
        ],
      }),
    );

    const credits = testDb
      .select({
        artistId: trackArtists.artistId,
        position: trackArtists.position,
      })
      .from(trackArtists)
      .where(eq(trackArtists.trackId, t1))
      .all();
    expect(credits).toHaveLength(2);

    const newcomer = testDb
      .select()
      .from(artists)
      .where(eq(artists.name, "Newcomer XYZ"))
      .get();
    expect(newcomer).toBeDefined();

    // Lead credit (position 0) becomes the track's artistId.
    const lead = testDb
      .select()
      .from(artists)
      .where(eq(artists.name, "Lead Person"))
      .get()!;
    expect(trackRow(t1)!.artistId).toBe(lead.id);
  });

  it("falls back to the album artist when a track has no credits", () => {
    const artistId = seedArtist("Original Artist");
    const albumId = seedAlbum(artistId, "Original Album");
    const t1 = seedTrack(artistId, albumId, { filePath: "/m/1.flac" });

    applyAlbumEdit(
      albumId,
      payload({
        artistName: "Album Owner",
        tracks: [editTrack(t1, { artists: [] })],
      }),
    );

    const album = getAlbumById(albumId)!;
    expect(trackRow(t1)!.artistId).toBe(album.artistId);
    const credits = testDb
      .select()
      .from(trackArtists)
      .where(eq(trackArtists.trackId, t1))
      .all();
    expect(credits).toHaveLength(0);
  });

  it("detaches a removed track instead of deleting it", () => {
    const artistId = seedArtist("Original Artist");
    const albumId = seedAlbum(artistId, "Original Album");
    const keep = seedTrack(artistId, albumId, { filePath: "/m/1.flac" });
    const drop = seedTrack(artistId, albumId, { filePath: "/m/2.flac" });

    const counts = applyAlbumEdit(
      albumId,
      payload({ tracks: [editTrack(keep)] }),
    );

    expect(counts.removedTracks).toBe(1);
    const dropped = trackRow(drop);
    expect(dropped).toBeDefined(); // row still exists
    expect(dropped!.albumId).toBeNull(); // detached, not deleted
  });

  it("attaches a library track and recomputes the source album's artist", () => {
    const artistA = seedArtist("Artist A");
    const target = seedAlbum(artistA, "Target Album");
    const targetTrack = seedTrack(artistA, target, { filePath: "/t/1.flac" });

    const artistB = seedArtist("Artist B");
    const source = seedAlbum(artistB, "Source Album");
    const moving = seedTrack(artistB, source, { filePath: "/s/1.flac" });
    const staying = seedTrack(artistB, source, { filePath: "/s/2.flac" });
    // The source album needs a resolved track for dominant-artist recompute.
    updateTrackByTrackId(staying, { resolutionStatus: "resolved" });

    const counts = applyAlbumEdit(
      target,
      payload({
        artistName: "Artist A",
        tracks: [editTrack(targetTrack), editTrack(moving)],
      }),
    );

    expect(counts.attachedTracks).toBe(1);
    expect(counts.updatedTracks).toBe(1);
    expect(trackRow(moving)!.albumId).toBe(target);
    // Source album's lead artist recomputed from its remaining resolved track.
    expect(getAlbumById(source)!.artistId).toBe(artistB);
  });

  it("keeps tracks_fts in sync with the edited title", () => {
    const artistId = seedArtist("Original Artist");
    const albumId = seedAlbum(artistId, "Original Album");
    const t1 = seedTrack(artistId, albumId, { filePath: "/m/1.flac" });

    applyAlbumEdit(
      albumId,
      payload({
        title: "Album Searchable",
        tracks: [editTrack(t1, { title: "Track Searchable" })],
      }),
    );

    const fts = testDb
      .all(
        sql`SELECT title, album_title FROM tracks_fts WHERE track_id = ${t1}`,
      )
      .at(0) as { title: string; album_title: string } | undefined;
    expect(fts?.title).toBe("Track Searchable");
    expect(fts?.album_title).toBe("Album Searchable");
  });

  it("returns counts for updated, removed and attached tracks", () => {
    const artistId = seedArtist("Original Artist");
    const albumId = seedAlbum(artistId, "Original Album");
    const a = seedTrack(artistId, albumId, { filePath: "/m/a.flac" });
    seedTrack(artistId, albumId, { filePath: "/m/b.flac" }); // will be removed

    const otherAlbum = seedAlbum(artistId, "Other Album");
    const c = seedTrack(artistId, otherAlbum, { filePath: "/m/c.flac" }); // attached

    const counts = applyAlbumEdit(
      albumId,
      payload({ tracks: [editTrack(a), editTrack(c)] }),
    );

    expect(counts).toEqual({
      updatedTracks: 1,
      removedTracks: 1,
      attachedTracks: 1,
    });
  });
});
