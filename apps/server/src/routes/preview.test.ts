import { describe, it, expect, vi, beforeEach } from "vitest";
import previewRoutes from "./preview.js";
import { buildApp } from "./__fixtures__/app.js";
import type { PreviewResolution } from "../preview/index.js";

vi.mock("fastify-plugin", () => ({ default: (fn: unknown) => fn }));
vi.mock("@fastify/secure-session", () => ({ default: vi.fn() }));
vi.mock("../preview/index.js", () => ({ resolvePreview: vi.fn() }));
vi.mock("../db/queries/preview-cache.js", () => ({
  deleteCachedPreview: vi.fn(),
}));
vi.mock("../lib/ssrf.js", () => ({ isPublicHost: vi.fn() }));
vi.mock("../logger.js", () => ({
  logger: {
    child: () => ({
      warn: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

import { resolvePreview } from "../preview/index.js";
import { deleteCachedPreview } from "../db/queries/preview-cache.js";
import { isPublicHost } from "../lib/ssrf.js";

const BASE_URL = "/mbid-abc-123/stream?artistName=Artist&trackTitle=Track";

const noPreview: PreviewResolution = { previewUrl: null, source: "none" };
const deezerPreview = (url: string): PreviewResolution => ({
  previewUrl: url,
  source: "deezer",
});

function makeStream() {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("audio-data"));
      controller.close();
    },
  });
}

// The proxy buffers the upstream body (await upstream.arrayBuffer()) before
// serving it range-aware, so the mock exposes both a body stream and the same
// bytes via arrayBuffer(). `bytes` overrides the buffered payload for the
// actual-size cap test; it defaults to the 10-byte "audio-data" sample.
function makeResponse(
  overrides: {
    ok?: boolean;
    status?: number;
    headers?: Record<string, string>;
    body?: ReadableStream | null;
    bytes?: Uint8Array;
  } = {},
) {
  const bytes = overrides.bytes ?? new TextEncoder().encode("audio-data");
  return {
    ok: overrides.ok ?? true,
    status: overrides.status ?? 200,
    body: overrides.body !== undefined ? overrides.body : makeStream(),
    arrayBuffer: async () =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    headers: {
      get: (key: string) => overrides.headers?.[key.toLowerCase()] ?? null,
    },
  } as unknown as Response;
}

describe("GET /:recordingMbid/stream — preview SSRF guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isPublicHost).mockResolvedValue(true);
  });

  it("returns 404 when no preview URL resolves", async () => {
    vi.mocked(resolvePreview).mockResolvedValue(noPreview);
    const app = buildApp(previewRoutes);
    const res = await app.inject({ method: "GET", url: BASE_URL });
    expect(res.statusCode).toBe(404);
  });

  it("streams audio range-aware on a valid https URL from a public host", async () => {
    vi.mocked(resolvePreview).mockResolvedValue(
      deezerPreview("https://cdn.deezer.com/preview/abc.mp3"),
    );
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          makeResponse({ headers: { "content-length": "500000" } }),
        ),
    );
    const app = buildApp(previewRoutes);
    const res = await app.inject({ method: "GET", url: BASE_URL });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/audio\/mpeg/);
    // Advertise range support so the native player builds a seekable timeline.
    expect(res.headers["accept-ranges"]).toBe("bytes");
    // Content-Length reflects the actual buffered bytes, not the upstream header.
    expect(res.headers["content-length"]).toBe("10");
    vi.unstubAllGlobals();
  });

  it("serves partial content (206) for a Range request", async () => {
    vi.mocked(resolvePreview).mockResolvedValue(
      deezerPreview("https://cdn.deezer.com/preview/abc.mp3"),
    );
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeResponse()));
    const app = buildApp(previewRoutes);
    const res = await app.inject({
      method: "GET",
      url: BASE_URL,
      headers: { range: "bytes=0-3" },
    });
    expect(res.statusCode).toBe(206);
    expect(res.headers["content-range"]).toBe("bytes 0-3/10");
    expect(res.headers["content-length"]).toBe("4");
    expect(res.headers["accept-ranges"]).toBe("bytes");
    expect(res.body).toBe("audi");
    vi.unstubAllGlobals();
  });

  it("returns 416 for an unsatisfiable Range request", async () => {
    vi.mocked(resolvePreview).mockResolvedValue(
      deezerPreview("https://cdn.deezer.com/preview/abc.mp3"),
    );
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeResponse()));
    const app = buildApp(previewRoutes);
    const res = await app.inject({
      method: "GET",
      url: BASE_URL,
      headers: { range: "bytes=50-60" },
    });
    expect(res.statusCode).toBe(416);
    expect(res.headers["content-range"]).toBe("bytes */10");
    vi.unstubAllGlobals();
  });

  it("rejects non-https preview URLs without fetching", async () => {
    vi.mocked(resolvePreview)
      .mockResolvedValueOnce(
        deezerPreview("http://cdn.deezer.com/preview/abc.mp3"),
      )
      .mockResolvedValueOnce(noPreview);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const app = buildApp(previewRoutes);
    const res = await app.inject({ method: "GET", url: BASE_URL });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(vi.mocked(deleteCachedPreview)).toHaveBeenCalledWith("mbid-abc-123");
    expect(res.statusCode).toBe(404);
    vi.unstubAllGlobals();
  });

  it("rejects URLs resolving to private hosts without fetching", async () => {
    vi.mocked(resolvePreview)
      .mockResolvedValueOnce(
        deezerPreview("https://internal.example/preview.mp3"),
      )
      .mockResolvedValueOnce(noPreview);
    vi.mocked(isPublicHost).mockResolvedValue(false);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const app = buildApp(previewRoutes);
    const res = await app.inject({ method: "GET", url: BASE_URL });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(vi.mocked(deleteCachedPreview)).toHaveBeenCalledWith("mbid-abc-123");
    expect(res.statusCode).toBe(404);
    vi.unstubAllGlobals();
  });

  it("retries with fresh URL when cached URL is stale (non-ok response)", async () => {
    vi.mocked(resolvePreview)
      .mockResolvedValueOnce(deezerPreview("https://cdn.deezer.com/stale.mp3"))
      .mockResolvedValueOnce(deezerPreview("https://cdn.deezer.com/fresh.mp3"));
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          makeResponse({ ok: false, status: 404, body: null }),
        )
        .mockResolvedValueOnce(makeResponse()),
    );

    const app = buildApp(previewRoutes);
    const res = await app.inject({ method: "GET", url: BASE_URL });

    expect(vi.mocked(deleteCachedPreview)).toHaveBeenCalledWith("mbid-abc-123");
    expect(res.statusCode).toBe(200);
    vi.unstubAllGlobals();
  });

  it("returns 502 when both initial and retry fetches fail", async () => {
    vi.mocked(resolvePreview)
      .mockResolvedValueOnce(deezerPreview("https://cdn.deezer.com/stale.mp3"))
      .mockResolvedValueOnce(
        deezerPreview("https://cdn.deezer.com/also-stale.mp3"),
      );
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          makeResponse({ ok: false, status: 404, body: null }),
        ),
    );

    const app = buildApp(previewRoutes);
    const res = await app.inject({ method: "GET", url: BASE_URL });

    expect(res.statusCode).toBe(502);
    vi.unstubAllGlobals();
  });

  it("returns 502 when Content-Length exceeds 10 MB", async () => {
    vi.mocked(resolvePreview).mockResolvedValue(
      deezerPreview("https://cdn.deezer.com/preview/big.mp3"),
    );
    const oversize = 11 * 1024 * 1024;
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          makeResponse({ headers: { "content-length": String(oversize) } }),
        ),
    );

    const app = buildApp(previewRoutes);
    const res = await app.inject({ method: "GET", url: BASE_URL });

    expect(res.statusCode).toBe(502);
    vi.unstubAllGlobals();
  });

  it("sets Content-Length to the actual buffered size even when upstream omits it", async () => {
    vi.mocked(resolvePreview).mockResolvedValue(
      deezerPreview("https://cdn.deezer.com/preview/abc.mp3"),
    );
    // makeResponse() omits the content-length header but the body is 10 bytes.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeResponse()));

    const app = buildApp(previewRoutes);
    const res = await app.inject({ method: "GET", url: BASE_URL });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-length"]).toBe("10");
    vi.unstubAllGlobals();
  });

  it("returns 502 when the buffered body exceeds 10 MB despite no declared length", async () => {
    vi.mocked(resolvePreview).mockResolvedValue(
      deezerPreview("https://cdn.deezer.com/preview/lying.mp3"),
    );
    // No content-length header, so the early fast-path check can't catch it;
    // the actual-bytes cap must reject after buffering.
    const oversize = new Uint8Array(11 * 1024 * 1024);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(makeResponse({ bytes: oversize })),
    );

    const app = buildApp(previewRoutes);
    const res = await app.inject({ method: "GET", url: BASE_URL });

    expect(res.statusCode).toBe(502);
    vi.unstubAllGlobals();
  });
});
