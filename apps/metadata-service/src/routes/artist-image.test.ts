import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Fastify from "fastify";
import artistImageRoutes, {
  ArtistUrlRelsSchema,
  WikidataEntitySchema,
} from "./artist-image.js";
import { mirrorFetch } from "../mirror/client.js";

vi.mock("../mirror/client.js", () => ({ mirrorFetch: vi.fn() }));

describe("ArtistUrlRelsSchema", () => {
  it("accepts a response with a wikidata relation", () => {
    const result = ArtistUrlRelsSchema.safeParse({
      relations: [
        {
          type: "wikidata",
          url: { resource: "https://www.wikidata.org/wiki/Q123" },
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("accepts a response with no relations field", () => {
    const result = ArtistUrlRelsSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejects a relation missing url.resource", () => {
    const result = ArtistUrlRelsSchema.safeParse({
      relations: [{ type: "wikidata", url: {} }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a relation where type is not a string", () => {
    const result = ArtistUrlRelsSchema.safeParse({
      relations: [{ type: 42, url: { resource: "https://..." } }],
    });
    expect(result.success).toBe(false);
  });
});

describe("WikidataEntitySchema", () => {
  it("accepts a valid entity with a P18 image claim", () => {
    const result = WikidataEntitySchema.safeParse({
      entities: {
        Q123: {
          claims: {
            P18: [{ mainsnak: { datavalue: { value: "Image.jpg" } } }],
          },
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts an entity with no claims field", () => {
    const result = WikidataEntitySchema.safeParse({
      entities: { Q123: {} },
    });
    expect(result.success).toBe(true);
  });

  it("accepts a P18 claim with no datavalue", () => {
    const result = WikidataEntitySchema.safeParse({
      entities: {
        Q123: {
          claims: {
            P18: [{ mainsnak: {} }],
          },
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a response missing the entities key", () => {
    const result = WikidataEntitySchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects a P18 entry where datavalue.value is not a string", () => {
    const result = WikidataEntitySchema.safeParse({
      entities: {
        Q123: {
          claims: {
            P18: [{ mainsnak: { datavalue: { value: 42 } } }],
          },
        },
      },
    });
    expect(result.success).toBe(false);
  });
});

describe("GET /artists/:mbid/image route", () => {
  const buildApp = () => {
    const app = Fastify({ logger: false });
    app.register(artistImageRoutes);
    return app;
  };

  const QID = "Q2831";

  const mbHit = () =>
    ({
      ok: true,
      status: 200,
      json: async () => ({
        relations: [
          {
            type: "wikidata",
            url: { resource: `https://www.wikidata.org/wiki/${QID}` },
          },
        ],
      }),
    }) as unknown as Response;

  const wdHit = (filename = "Image.jpg") =>
    ({
      ok: true,
      status: 200,
      json: async () => ({
        entities: {
          [QID]: {
            claims: { P18: [{ mainsnak: { datavalue: { value: filename } } }] },
          },
        },
      }),
    }) as unknown as Response;

  const errRes = (status: number) =>
    ({ ok: false, status }) as unknown as Response;

  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns 400 for an invalid MBID", async () => {
    const app = buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/artists/not-a-uuid/image",
    });
    expect(res.statusCode).toBe(400);
  });

  it("resolves the 3-hop chain and returns url + filename", async () => {
    vi.mocked(mirrorFetch).mockResolvedValue(mbHit());
    mockFetch.mockResolvedValue(wdHit());
    const app = buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/artists/11111111-1111-1111-1111-111111111111/image",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.url).toContain("commons.wikimedia.org");
    expect(body.filename).toBe("Image.jpg");
  });

  it("returns 502 when mirrorFetch throws", async () => {
    vi.mocked(mirrorFetch).mockRejectedValue(new Error("network"));
    const app = buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/artists/22222222-2222-2222-2222-222222222222/image",
    });
    expect(res.statusCode).toBe(502);
  });

  it("returns 404 when MB mirror returns 4xx", async () => {
    vi.mocked(mirrorFetch).mockResolvedValue(errRes(404));
    const app = buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/artists/33333333-3333-3333-3333-333333333333/image",
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns 404 when the artist has no Wikidata relation", async () => {
    vi.mocked(mirrorFetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ relations: [] }),
    } as unknown as Response);
    const app = buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/artists/44444444-4444-4444-4444-444444444444/image",
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns 404 when Wikidata has no P18 claim", async () => {
    vi.mocked(mirrorFetch).mockResolvedValue(mbHit());
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ entities: { [QID]: { claims: {} } } }),
    } as unknown as Response);
    const app = buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/artists/55555555-5555-5555-5555-555555555555/image",
    });
    expect(res.statusCode).toBe(404);
  });

  it("serves a positive result from cache on the second request", async () => {
    vi.mocked(mirrorFetch).mockResolvedValue(mbHit());
    mockFetch.mockResolvedValue(wdHit());
    const app = buildApp();
    const mbid = "66666666-6666-6666-6666-666666666666";
    await app.inject({ method: "GET", url: `/artists/${mbid}/image` });
    const res = await app.inject({
      method: "GET",
      url: `/artists/${mbid}/image`,
    });
    expect(res.statusCode).toBe(200);
    expect(vi.mocked(mirrorFetch)).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("serves a 404 null-sentinel from cache on the second request", async () => {
    vi.mocked(mirrorFetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ relations: [] }),
    } as unknown as Response);
    const app = buildApp();
    const mbid = "77777777-7777-7777-7777-777777777777";
    await app.inject({ method: "GET", url: `/artists/${mbid}/image` });
    const res = await app.inject({
      method: "GET",
      url: `/artists/${mbid}/image`,
    });
    expect(res.statusCode).toBe(404);
    expect(vi.mocked(mirrorFetch)).toHaveBeenCalledTimes(1);
  });

  it("does not cache a 502 — re-fetches on the next request", async () => {
    vi.mocked(mirrorFetch).mockRejectedValue(new Error("network"));
    const app = buildApp();
    const mbid = "88888888-8888-8888-8888-888888888888";
    await app.inject({ method: "GET", url: `/artists/${mbid}/image` });
    await app.inject({ method: "GET", url: `/artists/${mbid}/image` });
    expect(vi.mocked(mirrorFetch)).toHaveBeenCalledTimes(2);
  });

  it("bypasses cache and re-fetches after the 24h TTL expires", async () => {
    vi.useFakeTimers();
    vi.mocked(mirrorFetch).mockResolvedValue(mbHit());
    mockFetch.mockResolvedValue(wdHit());
    const app = buildApp();
    const mbid = "99999999-9999-9999-9999-999999999999";
    await app.inject({ method: "GET", url: `/artists/${mbid}/image` });
    vi.advanceTimersByTime(25 * 60 * 60 * 1000);
    await app.inject({ method: "GET", url: `/artists/${mbid}/image` });
    expect(vi.mocked(mirrorFetch)).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
