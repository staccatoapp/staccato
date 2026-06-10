import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/queries/lastfm-cache.js", () => ({
  getCachedTags: vi.fn(),
  upsertCachedTags: vi.fn(),
}));
vi.mock("./client.js", () => ({ getTopTags: vi.fn() }));

import { getCachedTags, upsertCachedTags } from "../db/queries/lastfm-cache.js";
import { getTopTags } from "./client.js";
import { entityKeyFor, getTagsCached, TAG_TTL_MS } from "./tag-cache.js";

const mGetCached = vi.mocked(getCachedTags);
const mUpsert = vi.mocked(upsertCachedTags);
const mGetTopTags = vi.mocked(getTopTags);

beforeEach(() => vi.clearAllMocks());

describe("entityKeyFor", () => {
  it("uses the mbid when present", () => {
    expect(entityKeyFor({ mbid: "abc", artist: "X", title: "Y" })).toBe("abc");
  });
  it("falls back to a normalised artist|title key", () => {
    expect(entityKeyFor({ artist: "Kendrick Lamar", title: "HUMBLE." })).toBe(
      "kendrick lamar|humble.",
    );
  });
});

describe("getTagsCached", () => {
  const now = 1_000_000_000_000;
  const ref = { artist: "A", title: "B" };

  it("returns cached tags on a fresh hit without calling the client", async () => {
    mGetCached.mockReturnValue({
      tags: JSON.stringify([{ name: "rock", weight: 50 }]),
      fetchedAt: now - 1000,
    } as ReturnType<typeof getCachedTags>);

    const tags = await getTagsCached("track", ref, now);

    expect(tags).toEqual([{ name: "rock", weight: 50 }]);
    expect(mGetTopTags).not.toHaveBeenCalled();
  });

  it("fetches + persists on a miss", async () => {
    mGetCached.mockReturnValue(undefined);
    mGetTopTags.mockResolvedValue([{ name: "pop", weight: 80 }]);

    const tags = await getTagsCached("track", ref, now);

    expect(tags).toEqual([{ name: "pop", weight: 80 }]);
    expect(mGetTopTags).toHaveBeenCalledWith("track", ref);
    expect(mUpsert).toHaveBeenCalledWith(
      "track",
      "a|b",
      [{ name: "pop", weight: 80 }],
      now,
    );
  });

  it("re-fetches when the cached row is older than the TTL", async () => {
    mGetCached.mockReturnValue({
      tags: JSON.stringify([{ name: "stale", weight: 10 }]),
      fetchedAt: now - TAG_TTL_MS - 1,
    } as ReturnType<typeof getCachedTags>);
    mGetTopTags.mockResolvedValue([{ name: "fresh", weight: 90 }]);

    const tags = await getTagsCached("track", ref, now);

    expect(tags).toEqual([{ name: "fresh", weight: 90 }]);
    expect(mGetTopTags).toHaveBeenCalled();
  });
});
