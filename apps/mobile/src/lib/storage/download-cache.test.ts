import { createBlobStore } from "./blob-store";

import {
  ensureDownloadedArt,
  ensureTrackDownloaded,
  extensionForDownload,
  getDownloadedArtUri,
  getDownloadedTrackUri,
} from "./download-cache";

jest.mock("./blob-store", () => ({
  createBlobStore: jest.fn(() => ({
    ensure: jest.fn(),
    uri: jest.fn(),
    remove: jest.fn(),
    clear: jest.fn(),
  })),
}));

// The single durable blob-store instance download-cache created at import time.
const store = jest.mocked(createBlobStore).mock.results[0]!.value as {
  ensure: jest.Mock;
  uri: jest.Mock;
};

const SESSION = { serverUrl: "https://music.home.arpa", token: "tok" };

beforeEach(() => {
  store.ensure.mockReset();
  store.uri.mockReset();
});

describe("extensionForDownload", () => {
  it("lowercases a known extension", () => {
    expect(extensionForDownload("FLAC")).toBe("flac");
    expect(extensionForDownload("mp3")).toBe("mp3");
  });

  it("falls back to mp3 for null/empty", () => {
    expect(extensionForDownload(null)).toBe("mp3");
    expect(extensionForDownload("")).toBe("mp3");
    expect(extensionForDownload("  ")).toBe("mp3");
  });
});

describe("ensureTrackDownloaded", () => {
  it("downloads the stream url under an audio key with the bearer header and format extension", async () => {
    store.ensure.mockResolvedValue("file://downloads/track.flac");

    const uri = await ensureTrackDownloaded("trk-1", "flac", SESSION);

    expect(store.ensure).toHaveBeenCalledWith(
      "audio:trk-1",
      "https://music.home.arpa/api/tracks/trk-1/stream",
      { headers: { Authorization: "Bearer tok" }, extension: "flac" },
    );
    expect(uri).toBe("file://downloads/track.flac");
  });

  it("propagates a download failure so the caller can mark the track failed", async () => {
    store.ensure.mockRejectedValue(new Error("network down"));
    await expect(
      ensureTrackDownloaded("trk-1", "mp3", SESSION),
    ).rejects.toThrow("network down");
  });
});

describe("getDownloadedTrackUri", () => {
  it("returns the pinned uri without downloading", async () => {
    store.uri.mockResolvedValue("file://downloads/track.flac");
    expect(await getDownloadedTrackUri("trk-1")).toBe(
      "file://downloads/track.flac",
    );
    expect(store.uri).toHaveBeenCalledWith("audio:trk-1");
    expect(store.ensure).not.toHaveBeenCalled();
  });

  it("returns null when the track is not downloaded", async () => {
    store.uri.mockResolvedValue(null);
    expect(await getDownloadedTrackUri("trk-1")).toBeNull();
  });
});

describe("getDownloadedArtUri", () => {
  it("returns the pinned art uri for a resolved cover, without downloading", async () => {
    store.uri.mockResolvedValue("file://downloads/cover.jpg");

    expect(await getDownloadedArtUri("/metadata/covers/x.jpg", SESSION)).toBe(
      "file://downloads/cover.jpg",
    );
    expect(store.uri).toHaveBeenCalledWith(
      "https://music.home.arpa/metadata/covers/x.jpg",
    );
    expect(store.ensure).not.toHaveBeenCalled();
  });

  it("returns null when there is no resolvable cover", async () => {
    expect(await getDownloadedArtUri(null, SESSION)).toBeNull();
    expect(store.uri).not.toHaveBeenCalled();
  });
});

describe("ensureDownloadedArt", () => {
  it("returns null and does not download when there is no cover", async () => {
    expect(await ensureDownloadedArt(null, SESSION)).toBeNull();
    expect(store.ensure).not.toHaveBeenCalled();
  });

  it("caches a server-relative cover with the bearer header (jpg)", async () => {
    store.ensure.mockResolvedValue("file://downloads/cover.jpg");

    const uri = await ensureDownloadedArt("/metadata/covers/x.jpg", SESSION);

    expect(store.ensure).toHaveBeenCalledWith(
      "https://music.home.arpa/metadata/covers/x.jpg",
      "https://music.home.arpa/metadata/covers/x.jpg",
      { headers: { Authorization: "Bearer tok" }, extension: "jpg" },
    );
    expect(uri).toBe("file://downloads/cover.jpg");
  });

  it("returns null (and swallows) when the art download fails", async () => {
    store.ensure.mockRejectedValue(new Error("boom"));
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

    expect(
      await ensureDownloadedArt("/metadata/covers/x.jpg", SESSION),
    ).toBeNull();
    expect(warn).toHaveBeenCalled();
  });
});
