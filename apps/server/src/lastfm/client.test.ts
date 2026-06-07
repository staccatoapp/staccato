import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Stub the gate so we can assert the client delegates to it; the gate's own
// backoff logic is unit-tested in lib/rate-limit.test.ts. parseRetryAfterMs is
// kept real so the 429 path's header parsing is exercised end-to-end.
const { gateMock } = vi.hoisted(() => ({
  gateMock: {
    waitMs: vi.fn(() => 0),
    noteLimited: vi.fn(() => 0),
    noteSuccess: vi.fn(),
  },
}));

vi.mock("../config/server-config.js", () => ({
  serverConfig: { get: vi.fn() },
}));

vi.mock("../lib/rate-limit.js", async (importActual) => {
  const actual = await importActual<typeof import("../lib/rate-limit.js")>();
  return { ...actual, createRateLimitGate: () => gateMock };
});

import { serverConfig } from "../config/server-config.js";
import {
  getTopTags,
  getSimilarTags,
  getSimilarArtists,
  getTopTracksForTag,
} from "./client.js";

const mockGet = vi.mocked(serverConfig.get);

function configWithKey(apiKey: string | null) {
  mockGet.mockReturnValue({
    // only the lastfm slice is read by the client
    lastfm: { apiKey, secret: null },
  } as ReturnType<typeof serverConfig.get>);
}

function mockFetchJson(body: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response);
}

beforeEach(() => {
  vi.clearAllMocks();
  gateMock.waitMs.mockReturnValue(0);
  configWithKey("test-key");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getTopTags", () => {
  it("parses weighted tags from a track.getTopTags body", async () => {
    const fetchMock = mockFetchJson({
      toptags: {
        tag: [
          { name: "Hip-Hop", count: 100, url: "x" },
          { name: "rap", count: 88, url: "x" },
        ],
      },
    });
    vi.stubGlobal("fetch", fetchMock);

    const tags = await getTopTags("track", {
      artist: "Kendrick Lamar",
      title: "HUMBLE.",
    });

    expect(tags).toEqual([
      { name: "Hip-Hop", weight: 100 },
      { name: "rap", weight: 88 },
    ]);
    const calledUrl = String(fetchMock.mock.calls[0]![0]);
    expect(calledUrl).toContain("method=track.gettoptags");
    expect(calledUrl).toContain("artist=Kendrick+Lamar");
    expect(calledUrl).toContain("track=HUMBLE.");
    expect(calledUrl).toContain("api_key=test-key");
    expect(calledUrl).not.toContain("mbid=");
  });

  it("prefers mbid when present", async () => {
    const fetchMock = mockFetchJson({ toptags: { tag: [] } });
    vi.stubGlobal("fetch", fetchMock);
    await getTopTags("artist", { mbid: "abc-mbid", artist: "X" });
    const calledUrl = String(fetchMock.mock.calls[0]![0]);
    expect(calledUrl).toContain("method=artist.gettoptags");
    expect(calledUrl).toContain("mbid=abc-mbid");
  });

  it("returns [] on a non-OK response without throwing", async () => {
    vi.stubGlobal("fetch", mockFetchJson({}, false, 404));
    const tags = await getTopTags("track", { artist: "A", title: "B" });
    expect(tags).toEqual([]);
  });

  it("returns [] and does not call fetch when no api key is configured", async () => {
    configWithKey(null);
    const fetchMock = mockFetchJson({ toptags: { tag: [] } });
    vi.stubGlobal("fetch", fetchMock);
    const tags = await getTopTags("track", { artist: "A", title: "B" });
    expect(tags).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("similarity", () => {
  it("parses similar tags", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchJson({
        similartags: { tag: [{ name: "trap" }, { name: "grime" }] },
      }),
    );
    expect(await getSimilarTags("hip-hop")).toEqual(["trap", "grime"]);
  });

  it("parses similar artists", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchJson({ similarartists: { artist: [{ name: "J. Cole" }] } }),
    );
    expect(await getSimilarArtists("Kendrick Lamar")).toEqual(["J. Cole"]);
  });
});

describe("getTopTracksForTag", () => {
  const body = {
    tracks: {
      track: [
        { name: "Alright", mbid: "mbid-1", artist: { name: "Kendrick Lamar" } },
        { name: "Nuvole Bianche", mbid: "", artist: { name: "Ludovico" } },
        { name: "No Artist Mbid", artist: { name: "Someone" } },
      ],
    },
  };

  it("parses tracks in popularity order with mbid null-handling", async () => {
    const fetchMock = mockFetchJson(body);
    vi.stubGlobal("fetch", fetchMock);

    const tracks = await getTopTracksForTag("hip-hop");

    expect(tracks).toEqual([
      { name: "Alright", artist: "Kendrick Lamar", mbid: "mbid-1" },
      { name: "Nuvole Bianche", artist: "Ludovico", mbid: null },
      { name: "No Artist Mbid", artist: "Someone", mbid: null },
    ]);
    const calledUrl = String(fetchMock.mock.calls[0]![0]);
    expect(calledUrl).toContain("method=tag.gettoptracks");
    expect(calledUrl).toContain("tag=hip-hop");
  });

  it("passes a custom limit", async () => {
    const fetchMock = mockFetchJson({ tracks: { track: [] } });
    vi.stubGlobal("fetch", fetchMock);
    await getTopTracksForTag("jazz", 10);
    expect(String(fetchMock.mock.calls[0]![0])).toContain("limit=10");
  });

  it("drops entries with no artist name", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchJson({
        tracks: { track: [{ name: "Orphan", mbid: "m" }] },
      }),
    );
    expect(await getTopTracksForTag("ambient")).toEqual([]);
  });

  it("returns [] on a non-OK response", async () => {
    vi.stubGlobal("fetch", mockFetchJson({}, false, 500));
    expect(await getTopTracksForTag("rock")).toEqual([]);
  });

  it("returns [] and does not fetch when no api key is configured", async () => {
    configWithKey(null);
    const fetchMock = mockFetchJson(body);
    vi.stubGlobal("fetch", fetchMock);
    expect(await getTopTracksForTag("rock")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("rate limiting & headers", () => {
  it("sends a Staccato User-Agent on every request", async () => {
    const fetchMock = mockFetchJson({ toptags: { tag: [] } });
    vi.stubGlobal("fetch", fetchMock);
    await getTopTags("track", { artist: "A", title: "B" });
    const opts = fetchMock.mock.calls[0]![1] as RequestInit;
    const headers = opts.headers as Record<string, string>;
    expect(headers["User-Agent"]).toContain("Staccato");
  });

  it("waits out the gate's backoff window before fetching", async () => {
    const order: string[] = [];
    gateMock.waitMs.mockImplementation(() => {
      order.push("waitMs");
      return 0;
    });
    const fetchMock = vi.fn().mockImplementation(() => {
      order.push("fetch");
      return Promise.resolve({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ toptags: { tag: [] } }),
      } as unknown as Response);
    });
    vi.stubGlobal("fetch", fetchMock);

    await getTopTags("track", { artist: "A", title: "B" });

    expect(order).toEqual(["waitMs", "fetch"]);
  });

  it("returns [] and notes the limit (with parsed Retry-After) on a 429", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: { get: () => "1" }, // Retry-After: 1 second
      json: vi.fn(),
    } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    const tags = await getTopTags("track", { artist: "A", title: "B" });

    expect(tags).toEqual([]);
    expect(gateMock.noteLimited).toHaveBeenCalledWith({ retryAfterMs: 1000 });
    expect(gateMock.noteSuccess).not.toHaveBeenCalled();
  });

  it("notes the limit on a Last.fm error-29 envelope", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchJson({ error: 29, message: "Rate Limit Exceeded" }),
    );

    const tags = await getTopTags("track", { artist: "A", title: "B" });

    expect(tags).toEqual([]);
    expect(gateMock.noteLimited).toHaveBeenCalledWith();
    expect(gateMock.noteSuccess).not.toHaveBeenCalled();
  });

  it("notes success to the gate on a clean response", async () => {
    vi.stubGlobal("fetch", mockFetchJson({ toptags: { tag: [] } }));
    await getTopTags("track", { artist: "A", title: "B" });
    expect(gateMock.noteSuccess).toHaveBeenCalled();
    expect(gateMock.noteLimited).not.toHaveBeenCalled();
  });
});
