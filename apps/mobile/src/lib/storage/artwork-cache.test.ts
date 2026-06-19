import { createBlobStore } from "./blob-store";

import { ensureArtworkFile } from "./artwork-cache";

jest.mock("./blob-store", () => ({
  createBlobStore: jest.fn(() => ({
    ensure: jest.fn(),
    remove: jest.fn(),
    clear: jest.fn(),
  })),
}));

// The single blob-store instance artwork-cache created at import time; grab its
// `ensure` so we can assert how covers are forwarded to it.
const ensure = jest.mocked(createBlobStore).mock.results[0]!.value
  .ensure as jest.Mock;

const SESSION = { serverUrl: "https://music.home.arpa", token: "tok" };

beforeEach(() => {
  ensure.mockReset();
  ensure.mockResolvedValue("file://blobs/cover.jpg");
});

describe("ensureArtworkFile", () => {
  it("returns null and does not download when there is no cover", async () => {
    expect(await ensureArtworkFile(null, SESSION)).toBeNull();
    expect(await ensureArtworkFile(undefined, SESSION)).toBeNull();
    expect(await ensureArtworkFile("", SESSION)).toBeNull();
    expect(ensure).not.toHaveBeenCalled();
  });

  it("returns null for a non-url sentinel cover", async () => {
    expect(await ensureArtworkFile("cover:external:rg-1", SESSION)).toBeNull();
    expect(ensure).not.toHaveBeenCalled();
  });

  it("caches a server-relative cover with the bearer header", async () => {
    const uri = await ensureArtworkFile("/metadata/covers/x.jpg", SESSION);

    expect(ensure).toHaveBeenCalledWith(
      "https://music.home.arpa/metadata/covers/x.jpg",
      "https://music.home.arpa/metadata/covers/x.jpg",
      { headers: { Authorization: "Bearer tok" } },
    );
    expect(uri).toBe("file://blobs/cover.jpg");
  });

  it("caches an absolute facade cover without an auth header", async () => {
    await ensureArtworkFile("https://facade.example/cover/rg-1", SESSION);

    expect(ensure).toHaveBeenCalledWith(
      "https://facade.example/cover/rg-1",
      "https://facade.example/cover/rg-1",
      { headers: undefined },
    );
  });

  it("returns null when no session is available for a relative cover", async () => {
    expect(await ensureArtworkFile("/metadata/covers/x.jpg", null)).toBeNull();
    expect(ensure).not.toHaveBeenCalled();
  });

  it("returns null (and swallows) when the download fails", async () => {
    ensure.mockRejectedValue(new Error("network down"));
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

    expect(
      await ensureArtworkFile("/metadata/covers/x.jpg", SESSION),
    ).toBeNull();
    expect(warn).toHaveBeenCalled();
  });
});
