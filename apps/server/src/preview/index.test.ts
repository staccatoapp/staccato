import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "../db/__fixtures__/db.js";
import { previewCache } from "../db/schema/index.js";
import { lookupDeezerPreview } from "./deezer.js";
import { lookupItunesPreview } from "./itunes.js";
import { resolvePreview } from "./index.js";

let testDb: ReturnType<typeof createTestDb>;

vi.mock("../db/client.js", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("../logger.js", () => ({
  logger: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
}));

vi.mock("./deezer.js", () => ({ lookupDeezerPreview: vi.fn() }));
vi.mock("./itunes.js", () => ({ lookupItunesPreview: vi.fn() }));

const MBID = "mbid-abc-123";
const ARTIST = "Portishead";
const TITLE = "Glory Box";

beforeEach(() => {
  testDb = createTestDb();
  vi.mocked(lookupDeezerPreview).mockReset();
  vi.mocked(lookupItunesPreview).mockReset();
});

describe("resolvePreview", () => {
  describe("cache hit", () => {
    it("returns cached result without calling Deezer or iTunes", async () => {
      testDb
        .insert(previewCache)
        .values({
          musicbrainzRecordingId: MBID,
          deezerTrackId: "dz-1",
          previewUrl: "https://cdn.deezer.com/preview/abc.mp3",
          source: "deezer",
        })
        .run();

      const result = await resolvePreview(MBID, ARTIST, TITLE);

      expect(result).toEqual({
        previewUrl: "https://cdn.deezer.com/preview/abc.mp3",
        source: "deezer",
      });
      expect(lookupDeezerPreview).not.toHaveBeenCalled();
      expect(lookupItunesPreview).not.toHaveBeenCalled();
    });
  });

  describe("cache miss — Deezer hit", () => {
    it("returns Deezer preview and writes it to the cache", async () => {
      vi.mocked(lookupDeezerPreview).mockResolvedValueOnce({
        deezerTrackId: "dz-42",
        previewUrl: "https://cdn.deezer.com/preview/xyz.mp3",
      });

      const result = await resolvePreview(MBID, ARTIST, TITLE);

      expect(result).toEqual({
        previewUrl: "https://cdn.deezer.com/preview/xyz.mp3",
        source: "deezer",
      });
      expect(lookupItunesPreview).not.toHaveBeenCalled();

      const rows = testDb.select().from(previewCache).all();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        musicbrainzRecordingId: MBID,
        deezerTrackId: "dz-42",
        previewUrl: "https://cdn.deezer.com/preview/xyz.mp3",
        source: "deezer",
      });
    });
  });

  describe("cache miss — Deezer miss, iTunes hit", () => {
    it("returns iTunes preview and writes it to the cache", async () => {
      vi.mocked(lookupDeezerPreview).mockResolvedValueOnce(null);
      vi.mocked(lookupItunesPreview).mockResolvedValueOnce({
        itunesTrackId: "it-99",
        previewUrl: "https://audio-ssl.itunes.apple.com/abc.m4a",
      });

      const result = await resolvePreview(MBID, ARTIST, TITLE);

      expect(result).toEqual({
        previewUrl: "https://audio-ssl.itunes.apple.com/abc.m4a",
        source: "itunes",
      });

      const rows = testDb.select().from(previewCache).all();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        musicbrainzRecordingId: MBID,
        itunesTrackId: "it-99",
        previewUrl: "https://audio-ssl.itunes.apple.com/abc.m4a",
        source: "itunes",
      });
    });
  });

  describe("cache miss — both miss (negative cache)", () => {
    it("writes a negative-cache entry and returns null URL", async () => {
      vi.mocked(lookupDeezerPreview).mockResolvedValueOnce(null);
      vi.mocked(lookupItunesPreview).mockResolvedValueOnce(null);

      const result = await resolvePreview(MBID, ARTIST, TITLE);

      expect(result).toEqual({ previewUrl: null, source: "none" });

      const rows = testDb.select().from(previewCache).all();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        musicbrainzRecordingId: MBID,
        source: "none",
        previewUrl: null,
      });
    });
  });
});
