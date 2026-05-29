import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../__fixtures__/db.js";
import { artists } from "../schema/artists.js";
import {
  backfillArtistNormalizedNames,
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
