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

  it("proceeds to fetch for an upload.wikimedia.org URL", async () => {
    vi.mocked(client.lookupArtistImageSource).mockResolvedValue({
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Photo.jpg",
      filename: "Photo.jpg",
    });
    mockFetch.mockResolvedValue({ ok: false, status: 404, body: null });
    await ensureArtistImageOnDisk("artist-wm");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Photo.jpg",
    );
  });

  it("proceeds to fetch for any wikimedia.org subdomain URL", async () => {
    vi.mocked(client.lookupArtistImageSource).mockResolvedValue({
      url: "https://commons.wikimedia.org/wiki/File:Artist.jpg",
      filename: "Artist.jpg",
    });
    mockFetch.mockResolvedValue({ ok: false, status: 404, body: null });
    await ensureArtistImageOnDisk("artist-commons");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://commons.wikimedia.org/wiki/File:Artist.jpg",
    );
  });
});
