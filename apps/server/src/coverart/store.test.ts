import { beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "./client.js";

vi.mock("./client.js");
vi.mock("../db/queries/albums.js");
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
    createWriteStream: vi.fn(),
  },
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  createWriteStream: vi.fn(),
}));
vi.mock("node:fs/promises", () => ({
  default: { rename: vi.fn(), unlink: vi.fn() },
  rename: vi.fn(),
  unlink: vi.fn(),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { ensureCoverOnDisk } from "./store.js";

describe("ensureCoverOnDisk — host validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null without fetching for a non-https URL", async () => {
    vi.mocked(client.fetchCoverArtUrlForGroup).mockResolvedValue(
      "http://coverartarchive.org/release-group/mbid-1/front",
    );
    expect(await ensureCoverOnDisk("mbid-http")).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns null without fetching for an attacker-controlled host", async () => {
    vi.mocked(client.fetchCoverArtUrlForGroup).mockResolvedValue(
      "https://evil.example.com/cover.jpg",
    );
    expect(await ensureCoverOnDisk("mbid-evil")).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns null without fetching for a URL that looks like archive.org but isn't", async () => {
    vi.mocked(client.fetchCoverArtUrlForGroup).mockResolvedValue(
      "https://notarchive.org/cover.jpg",
    );
    expect(await ensureCoverOnDisk("mbid-fake")).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("proceeds to fetch for a coverartarchive.org URL", async () => {
    vi.mocked(client.fetchCoverArtUrlForGroup).mockResolvedValue(
      "https://coverartarchive.org/release-group/mbid-ok/front",
    );
    mockFetch.mockResolvedValue({ ok: false, status: 404, body: null });
    await ensureCoverOnDisk("mbid-caa");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://coverartarchive.org/release-group/mbid-ok/front",
      expect.any(Object),
    );
  });

  it("proceeds to fetch for an archive.org subdomain URL", async () => {
    vi.mocked(client.fetchCoverArtUrlForGroup).mockResolvedValue(
      "https://ia800805.us.archive.org/27/items/mbid-ia/front.jpg",
    );
    mockFetch.mockResolvedValue({ ok: false, status: 404, body: null });
    await ensureCoverOnDisk("mbid-ia");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://ia800805.us.archive.org/27/items/mbid-ia/front.jpg",
      expect.any(Object),
    );
  });

  it("proceeds to fetch for a coverartarchive.org subdomain URL", async () => {
    vi.mocked(client.fetchCoverArtUrlForGroup).mockResolvedValue(
      "https://static.coverartarchive.org/release-group/mbid-sub/front.jpg",
    );
    mockFetch.mockResolvedValue({ ok: false, status: 404, body: null });
    await ensureCoverOnDisk("mbid-sub");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://static.coverartarchive.org/release-group/mbid-sub/front.jpg",
      expect.any(Object),
    );
  });
});
