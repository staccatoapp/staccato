import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Fastify from "fastify";
import coverArtRoutes, { cache } from "./cover-art.js";

describe("GET /cover-art/release-group/:mbid", () => {
  const buildApp = () => {
    const app = Fastify({ logger: false });
    app.register(coverArtRoutes);
    return app;
  };

  const COVER_URL = "https://archive.org/cover.jpg";

  const redirectRes = (location: string, status = 302) =>
    ({
      status,
      headers: { get: (h: string) => (h === "location" ? location : null) },
    }) as unknown as Response;

  const notFoundRes = () => ({ status: 404 }) as unknown as Response;
  const errRes = (status: number) => ({ status }) as unknown as Response;

  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns 400 for an invalid MBID", async () => {
    const app = buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/cover-art/release-group/not-a-uuid",
    });
    expect(res.statusCode).toBe(400);
  });

  it("follows the redirect and caches the cover URL", async () => {
    mockFetch.mockResolvedValue(redirectRes(COVER_URL));
    const app = buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/cover-art/release-group/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe(COVER_URL);
  });

  it("returns 404 when CAA returns 404 and caches the miss", async () => {
    mockFetch.mockResolvedValue(notFoundRes());
    const app = buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/cover-art/release-group/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns 502 when CAA fetch throws", async () => {
    mockFetch.mockRejectedValue(new Error("network"));
    const app = buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/cover-art/release-group/cccccccc-cccc-cccc-cccc-cccccccccccc",
    });
    expect(res.statusCode).toBe(502);
  });

  it("returns 502 when CAA returns an unexpected status", async () => {
    mockFetch.mockResolvedValue(errRes(500));
    const app = buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/cover-art/release-group/dddddddd-dddd-dddd-dddd-dddddddddddd",
    });
    expect(res.statusCode).toBe(502);
  });

  it("serves a positive result from cache on the second request", async () => {
    mockFetch.mockResolvedValue(redirectRes(COVER_URL));
    const app = buildApp();
    const mbid = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
    await app.inject({
      method: "GET",
      url: `/cover-art/release-group/${mbid}`,
    });
    const res = await app.inject({
      method: "GET",
      url: `/cover-art/release-group/${mbid}`,
    });
    expect(res.statusCode).toBe(302);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("serves a 404 null-sentinel from cache on the second request", async () => {
    mockFetch.mockResolvedValue(notFoundRes());
    const app = buildApp();
    const mbid = "ffffffff-ffff-ffff-ffff-ffffffffffff";
    await app.inject({
      method: "GET",
      url: `/cover-art/release-group/${mbid}`,
    });
    const res = await app.inject({
      method: "GET",
      url: `/cover-art/release-group/${mbid}`,
    });
    expect(res.statusCode).toBe(404);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("does not cache a 502 — re-fetches on the next request", async () => {
    mockFetch.mockRejectedValue(new Error("network"));
    const app = buildApp();
    const mbid = "11111111-1111-1111-1111-111111111110";
    await app.inject({
      method: "GET",
      url: `/cover-art/release-group/${mbid}`,
    });
    await app.inject({
      method: "GET",
      url: `/cover-art/release-group/${mbid}`,
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("bypasses cache and re-fetches after the 24h TTL expires", async () => {
    vi.useFakeTimers();
    mockFetch.mockResolvedValue(redirectRes(COVER_URL));
    const app = buildApp();
    const mbid = "22222222-2222-2222-2222-222222222220";
    await app.inject({
      method: "GET",
      url: `/cover-art/release-group/${mbid}`,
    });
    vi.advanceTimersByTime(25 * 60 * 60 * 1000);
    await app.inject({
      method: "GET",
      url: `/cover-art/release-group/${mbid}`,
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("handles 307 redirect the same as 302", async () => {
    mockFetch.mockResolvedValue(redirectRes(COVER_URL, 307));
    const app = buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/cover-art/release-group/33333333-3333-3333-3333-333333333330",
    });
    expect(res.statusCode).toBe(302);
  });
});

describe("cover-art cache — LRU properties", () => {
  it("is bounded at 10_000 entries", () => {
    expect(cache.max).toBe(10_000);
  });

  it("has a 24-hour TTL", () => {
    expect(cache.ttl).toBe(24 * 60 * 60 * 1000);
  });
});
