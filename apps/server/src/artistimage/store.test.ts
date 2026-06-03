import { beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "./client.js";

vi.mock("./client.js");
vi.mock("../db/queries/artists.js");
vi.mock("../logger.js", () => ({
  logger: {
    child: () => ({
      warn: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
    }),
  },
}));
vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn(() => false),
    mkdirSync: vi.fn(),
    readdirSync: vi.fn(() => []),
    createWriteStream: vi.fn(),
  },
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(() => []),
  createWriteStream: vi.fn(),
}));
vi.mock("node:fs/promises", () => ({
  default: { rename: vi.fn(), unlink: vi.fn() },
  rename: vi.fn(),
  unlink: vi.fn(),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { ensureArtistImageOnDisk } from "./store.js";
import { MAX_IMAGE_BYTES } from "../remote-image.js";

const WIKIMEDIA_URL =
  "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Photo.jpg";

function makeResponse(
  ok: boolean,
  status: number,
  contentLength?: number,
): object {
  return {
    ok,
    status,
    body: ok ? { readable: true } : null,
    headers: {
      get: (h: string) =>
        h.toLowerCase() === "content-length" && contentLength != null
          ? String(contentLength)
          : null,
    },
  };
}

describe("ensureArtistImageOnDisk — host validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null without fetching for a non-https URL", async () => {
    vi.mocked(client.lookupArtistImageSource).mockResolvedValue({
      url: "http://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Photo.jpg",
      filename: "Photo.jpg",
    });
    expect(await ensureArtistImageOnDisk("artist-http")).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns null without fetching for an attacker-controlled host", async () => {
    vi.mocked(client.lookupArtistImageSource).mockResolvedValue({
      url: "https://evil.example.com/artist.jpg",
      filename: "artist.jpg",
    });
    expect(await ensureArtistImageOnDisk("artist-evil")).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns null without fetching for a URL that looks like wikimedia but isn't", async () => {
    vi.mocked(client.lookupArtistImageSource).mockResolvedValue({
      url: "https://fakewikimedia.org/artist.jpg",
      filename: "artist.jpg",
    });
    expect(await ensureArtistImageOnDisk("artist-fake")).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("fetches with redirect:manual for an upload.wikimedia.org URL", async () => {
    vi.mocked(client.lookupArtistImageSource).mockResolvedValue({
      url: WIKIMEDIA_URL,
      filename: "Photo.jpg",
    });
    mockFetch.mockResolvedValue(makeResponse(false, 404));
    await ensureArtistImageOnDisk("artist-wm");
    expect(mockFetch).toHaveBeenCalledWith(WIKIMEDIA_URL, {
      redirect: "manual",
    });
  });

  it("fetches with redirect:manual for any wikimedia.org subdomain URL", async () => {
    const url = "https://commons.wikimedia.org/wiki/File:Artist.jpg";
    vi.mocked(client.lookupArtistImageSource).mockResolvedValue({
      url,
      filename: "Artist.jpg",
    });
    mockFetch.mockResolvedValue(makeResponse(false, 404));
    await ensureArtistImageOnDisk("artist-commons");
    expect(mockFetch).toHaveBeenCalledWith(url, { redirect: "manual" });
  });
});

describe("ensureArtistImageOnDisk — SSRF and size guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when Wikimedia URL redirects (opaque-redirect response)", async () => {
    vi.mocked(client.lookupArtistImageSource).mockResolvedValue({
      url: WIKIMEDIA_URL,
      filename: "Photo.jpg",
    });
    // redirect:"manual" causes a 3xx to surface as ok:false, status:0
    mockFetch.mockResolvedValue(makeResponse(false, 0));
    expect(await ensureArtistImageOnDisk("artist-redirect")).toBeNull();
  });

  it("returns null when Content-Length exceeds the size cap", async () => {
    vi.mocked(client.lookupArtistImageSource).mockResolvedValue({
      url: WIKIMEDIA_URL,
      filename: "Photo.jpg",
    });
    mockFetch.mockResolvedValue(makeResponse(true, 200, MAX_IMAGE_BYTES + 1));
    expect(await ensureArtistImageOnDisk("artist-toobig")).toBeNull();
  });
});
