import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { createTestDb, seedArtist, seedAlbum } from "../__fixtures__/db.js";
import { artists } from "../schema/artists.js";
import { albumArtists } from "../schema/album-artists.js";
import {
  backfillArtistNormalizedNames,
  getArtists,
  updateArtist,
  upsertArtist,
} from "./artists.js";

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

describe("getArtists", () => {
  it("returns albumCount 0 for an artist with no albums", () => {
    seedArtist("Burial");
    const rows = getArtists({ limit: 10, offset: 0 });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.albumCount).toBe(0);
  });

  it("counts albums owned via the legacy albums.artist_id FK", () => {
    const artistId = seedArtist("Portishead");
    seedAlbum(artistId, "Dummy");
    seedAlbum(artistId, "Portishead");
    const rows = getArtists({ limit: 10, offset: 0 });
    expect(rows[0]!.albumCount).toBe(2);
  });

  it("counts albums credited via albumArtists.isPrimary = true", () => {
    const mainArtistId = seedArtist("MF DOOM");
    const collabArtistId = seedArtist("Madlib");
    const albumId = seedAlbum(collabArtistId, "Madvillainy");
    testDb
      .insert(albumArtists)
      .values({
        id: createId(),
        albumId,
        artistId: mainArtistId,
        position: 1,
        isPrimary: true,
      })
      .run();
    const rows = getArtists({ limit: 10, offset: 0 });
    const doom = rows.find((r) => r.id === mainArtistId)!;
    expect(doom.albumCount).toBe(1);
  });

  it("counts an album only once when it appears via both ownership paths", () => {
    const artistId = seedArtist("Actress");
    const albumId = seedAlbum(artistId, "Hazyville");
    testDb
      .insert(albumArtists)
      .values({
        id: createId(),
        albumId,
        artistId,
        position: 1,
        isPrimary: true,
      })
      .run();
    const rows = getArtists({ limit: 10, offset: 0 });
    expect(rows[0]!.albumCount).toBe(1);
  });

  it("does not count albums where the artist has only a non-primary (feat) credit", () => {
    const featArtistId = seedArtist("Ghostface Killah");
    const ownerArtistId = seedArtist("Danger Mouse");
    const albumId = seedAlbum(ownerArtistId, "The Mouse and the Mask");
    testDb
      .insert(albumArtists)
      .values({
        id: createId(),
        albumId,
        artistId: featArtistId,
        position: 1,
        isPrimary: false,
      })
      .run();
    const rows = getArtists({ limit: 10, offset: 0 });
    const feat = rows.find((r) => r.id === featArtistId)!;
    expect(feat.albumCount).toBe(0);
  });

  it("returns correct album counts for multiple artists simultaneously", () => {
    const artistA = seedArtist("Aphex Twin");
    const artistB = seedArtist("Boards of Canada");
    const artistC = seedArtist("Autechre");
    seedAlbum(artistA, "Selected Ambient Works");
    seedAlbum(artistA, "Come to Daddy");
    seedAlbum(artistB, "Music Has the Right to Children");
    // artistC has no albums
    const rows = getArtists({ limit: 10, offset: 0 });
    const a = rows.find((r) => r.id === artistA)!;
    const b = rows.find((r) => r.id === artistB)!;
    const c = rows.find((r) => r.id === artistC)!;
    expect(a.albumCount).toBe(2);
    expect(b.albumCount).toBe(1);
    expect(c.albumCount).toBe(0);
  });

  it("paginates results ordered alphabetically by name when sort=title", () => {
    seedArtist("Zomby");
    seedArtist("Air");
    seedArtist("Massive Attack");
    const page1 = getArtists({ limit: 2, offset: 0 }, "title");
    const page2 = getArtists({ limit: 2, offset: 2 }, "title");
    expect(page1).toHaveLength(2);
    expect(page1[0]!.name).toBe("Air");
    expect(page1[1]!.name).toBe("Massive Attack");
    expect(page2).toHaveLength(1);
    expect(page2[0]!.name).toBe("Zomby");
  });
});

describe("upsertArtist", () => {
  describe("Stage 1 — indexed normalizedName lookup", () => {
    it("returns existing artist id when normalizedName matches", () => {
      const id1 = upsertArtist("Massive Attack");
      const id2 = upsertArtist("massive attack");
      expect(id2).toBe(id1);
    });

    it("sets mbid on existing artist when caller supplies one and row has none", () => {
      const id = upsertArtist("Portishead");
      const idWithMbid = upsertArtist("Portishead", "mbid-portishead");
      expect(idWithMbid).toBe(id);
      const row = testDb.select().from(artists).where(eq(artists.id, id)).get();
      expect(row?.musicbrainzId).toBe("mbid-portishead");
    });

    it("does not overwrite an existing mbid", () => {
      upsertArtist("Björk", "mbid-bjork");
      upsertArtist("Björk", "mbid-other");
      const rows = testDb.select().from(artists).all();
      expect(rows).toHaveLength(1);
      expect(rows[0]?.musicbrainzId).toBe("mbid-bjork");
    });
  });

  describe("Stage 2 — normalizedCanonicalName lookup", () => {
    it("matches an artist by their MB canonical name", () => {
      const id = upsertArtist("MF DOOM");
      updateArtist(id, {
        canonicalName: "MF Doom",
        normalizedCanonicalName: "mf doom",
      });

      const id2 = upsertArtist("MF Doom");
      expect(id2).toBe(id);
    });

    it("sets mbid when canonical match has none", () => {
      const id = upsertArtist("Mos Def");
      updateArtist(id, {
        canonicalName: "Yasiin Bey",
        normalizedCanonicalName: "yasiin bey",
      });

      const id2 = upsertArtist("Yasiin Bey", "mbid-yasiin");
      expect(id2).toBe(id);
      const row = testDb.select().from(artists).where(eq(artists.id, id)).get();
      expect(row?.musicbrainzId).toBe("mbid-yasiin");
    });
  });

  describe("Stage 3 — insert", () => {
    it("creates a new row for an unknown artist", () => {
      const id = upsertArtist("Aphex Twin");
      const row = testDb.select().from(artists).where(eq(artists.id, id)).get();
      expect(row?.name).toBe("Aphex Twin");
      expect(row?.normalizedName).toBe("aphex twin");
    });

    it("inserts with mbid when supplied", () => {
      const id = upsertArtist("Burial", "mbid-burial");
      const row = testDb.select().from(artists).where(eq(artists.id, id)).get();
      expect(row?.musicbrainzId).toBe("mbid-burial");
    });
  });
});

describe("backfillArtistNormalizedNames", () => {
  it("backfills normalizedName for rows where it is null", () => {
    const id = upsertArtist("Four Tet");
    testDb
      .update(artists)
      .set({ normalizedName: null })
      .where(eq(artists.id, id))
      .run();

    backfillArtistNormalizedNames();

    const row = testDb.select().from(artists).where(eq(artists.id, id)).get();
    expect(row?.normalizedName).toBe("four tet");
  });

  it("backfills normalizedCanonicalName for rows with canonicalName but no normalizedCanonicalName", () => {
    const id = upsertArtist("Daft Punk");
    testDb
      .update(artists)
      .set({ canonicalName: "Daft Punk", normalizedCanonicalName: null })
      .where(eq(artists.id, id))
      .run();

    backfillArtistNormalizedNames();

    const row = testDb.select().from(artists).where(eq(artists.id, id)).get();
    expect(row?.normalizedCanonicalName).toBe("daft punk");
  });

  it("does not overwrite already-set normalizedCanonicalName", () => {
    const id = upsertArtist("Boards of Canada");
    testDb
      .update(artists)
      .set({
        canonicalName: "Boards of Canada",
        normalizedCanonicalName: "boards of canada",
      })
      .where(eq(artists.id, id))
      .run();

    backfillArtistNormalizedNames();

    const row = testDb.select().from(artists).where(eq(artists.id, id)).get();
    expect(row?.normalizedCanonicalName).toBe("boards of canada");
  });
});
