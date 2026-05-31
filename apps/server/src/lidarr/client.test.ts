import { beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { fetchLidarrOptions, LidarrClient } from "./client.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

vi.mock("../logger.js", () => ({
  logger: {
    child: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

function okResponse(body: unknown, status = 200) {
  return Promise.resolve({
    ok: true,
    status,
    json: () => Promise.resolve(body),
  });
}

function errorResponse(status: number) {
  return Promise.resolve({ ok: false, status, json: vi.fn() });
}

describe("LidarrClient", () => {
  let client: LidarrClient;

  beforeEach(() => {
    mockFetch.mockReset();
    client = new LidarrClient("http://lidarr:8686", "test-api-key");
  });

  describe("testConnection", () => {
    it("returns true when Lidarr responds ok", async () => {
      mockFetch.mockReturnValue(okResponse({ version: "1.0" }));
      expect(await client.testConnection()).toBe(true);
    });

    it("returns false when Lidarr responds with an error", async () => {
      mockFetch.mockReturnValue(errorResponse(401));
      expect(await client.testConnection()).toBe(false);
    });

    it("returns false when fetch throws", async () => {
      mockFetch.mockRejectedValue(new Error("network error"));
      expect(await client.testConnection()).toBe(false);
    });
  });

  describe("getArtists", () => {
    it("parses a valid artist array", async () => {
      const artists = [
        {
          id: 1,
          artistName: "Radiohead",
          foreignArtistId: "mbid-rh",
          monitored: true,
        },
      ];
      mockFetch.mockReturnValue(okResponse(artists));
      expect(await client.getArtists()).toEqual(artists);
    });

    it("throws ZodError when a required field is missing", async () => {
      mockFetch.mockReturnValue(okResponse([{ id: 1, monitored: false }]));
      await expect(client.getArtists()).rejects.toBeInstanceOf(ZodError);
    });

    it("strips extra fields not in the schema", async () => {
      const raw = [
        {
          id: 2,
          artistName: "Portishead",
          foreignArtistId: "mbid-ph",
          monitored: false,
          extraField: "ignored",
        },
      ];
      mockFetch.mockReturnValue(okResponse(raw));
      const result = await client.getArtists();
      expect(result[0]).not.toHaveProperty("extraField");
    });
  });

  describe("addArtist", () => {
    const params = {
      artistMbid: "mbid-1",
      artistName: "Massive Attack",
      qualityProfileId: 1,
      metadataProfileId: 1,
      rootFolderPath: "/music",
    };

    it("parses a valid artist response", async () => {
      const artist = {
        id: 10,
        artistName: "Massive Attack",
        foreignArtistId: "mbid-1",
        monitored: true,
      };
      mockFetch.mockReturnValue(okResponse(artist));
      expect(await client.addArtist(params)).toEqual(artist);
    });

    it("throws ZodError when the response body is not an artist object", async () => {
      mockFetch.mockReturnValue(okResponse({ error: "bad request" }));
      await expect(client.addArtist(params)).rejects.toBeInstanceOf(ZodError);
    });
  });

  describe("getAlbumsForArtist", () => {
    it("parses a valid album array including optional statistics", async () => {
      const albums = [
        {
          id: 5,
          title: "OK Computer",
          foreignAlbumId: "mbid-okc",
          artistId: 1,
          monitored: true,
          statistics: {
            trackCount: 12,
            trackFileCount: 12,
            percentOfTracks: 100,
            sizeOnDisk: 500000000,
          },
        },
      ];
      mockFetch.mockReturnValue(okResponse(albums));
      expect(await client.getAlbumsForArtist(1)).toEqual(albums);
    });

    it("parses an album without statistics (optional field)", async () => {
      const albums = [
        {
          id: 6,
          title: "The Bends",
          foreignAlbumId: "mbid-bends",
          artistId: 1,
          monitored: false,
        },
      ];
      mockFetch.mockReturnValue(okResponse(albums));
      const result = await client.getAlbumsForArtist(1);
      expect(result[0]!.statistics).toBeUndefined();
    });

    it("throws ZodError when a required album field is missing", async () => {
      mockFetch.mockReturnValue(okResponse([{ id: 1, monitored: true }]));
      await expect(client.getAlbumsForArtist(1)).rejects.toBeInstanceOf(
        ZodError,
      );
    });
  });

  describe("getQueue", () => {
    it("unwraps the records envelope and returns the queue items", async () => {
      const items = [
        { id: 1, albumId: 5, title: "OK Computer", status: "downloading" },
      ];
      mockFetch.mockReturnValue(okResponse({ records: items }));
      expect(await client.getQueue()).toEqual(items);
    });

    it("returns empty array when records is empty", async () => {
      mockFetch.mockReturnValue(okResponse({ records: [] }));
      expect(await client.getQueue()).toEqual([]);
    });

    it("throws ZodError when response is not the expected envelope shape", async () => {
      mockFetch.mockReturnValue(okResponse([{ id: 1 }]));
      await expect(client.getQueue()).rejects.toBeInstanceOf(ZodError);
    });
  });

  describe("fetchLidarrOptions", () => {
    it("maps quality profiles, metadata profiles, and root folders into LidarrOptions shape", async () => {
      mockFetch
        .mockReturnValueOnce(okResponse([{ id: 1, name: "Lossless" }]))
        .mockReturnValueOnce(okResponse([{ id: 2, name: "Standard" }]))
        .mockReturnValueOnce(okResponse([{ id: 3, path: "/music" }]));

      const options = await fetchLidarrOptions(client);

      expect(options).toEqual({
        qualityProfiles: [{ id: 1, name: "Lossless" }],
        metadataProfiles: [{ id: 2, name: "Standard" }],
        rootFolders: [{ id: 3, path: "/music" }],
      });
    });

    it("propagates errors when any profile fetch fails", async () => {
      mockFetch
        .mockReturnValueOnce(okResponse([{ id: 1, name: "Lossless" }]))
        .mockReturnValueOnce(
          Promise.resolve({ ok: false, status: 500, json: vi.fn() }),
        )
        .mockReturnValueOnce(okResponse([{ id: 3, path: "/music" }]));

      await expect(fetchLidarrOptions(client)).rejects.toThrow();
    });
  });
});
