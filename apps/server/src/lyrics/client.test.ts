import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchLyrics } from "./client.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const { mockWarn } = vi.hoisted(() => ({ mockWarn: vi.fn() }));
vi.mock("../logger.js", () => ({
  logger: {
    child: () => ({
      warn: mockWarn,
      info: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

const params = {
  artistName: "Radiohead",
  trackName: "Karma Police",
  albumName: "OK Computer",
  durationSeconds: 263,
};

const validBody = {
  id: 1,
  name: "Karma Police",
  trackName: "Karma Police",
  artistName: "Radiohead",
  albumName: "OK Computer",
  duration: 263,
  instrumental: false,
  plainLyrics: "Arrest this man",
  syncedLyrics: null,
  lyricsfile: null,
};

function response(status: number, body?: unknown) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  });
}

beforeEach(() => {
  mockFetch.mockReset();
  mockWarn.mockReset();
});

describe("fetchLyrics", () => {
  it("returns parsed lyrics on a valid 200 response", async () => {
    mockFetch.mockReturnValue(response(200, validBody));
    const result = await fetchLyrics(params);
    expect(result).toMatchObject({ trackName: "Karma Police" });
    expect(mockWarn).not.toHaveBeenCalled();
  });

  it("returns null silently on 404", async () => {
    mockFetch.mockReturnValue(response(404));
    const result = await fetchLyrics(params);
    expect(result).toBeNull();
    expect(mockWarn).not.toHaveBeenCalled();
  });

  it("logs warn and returns null on non-ok non-404 response", async () => {
    mockFetch.mockReturnValue(response(500));
    const result = await fetchLyrics(params);
    expect(result).toBeNull();
    expect(mockWarn).toHaveBeenCalledOnce();
    expect(mockWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 500,
        artistName: params.artistName,
        trackName: params.trackName,
      }),
      "lrclib request failed",
    );
  });

  it("logs warn and returns null on network error", async () => {
    const err = new Error("network failure");
    mockFetch.mockRejectedValue(err);
    const result = await fetchLyrics(params);
    expect(result).toBeNull();
    expect(mockWarn).toHaveBeenCalledOnce();
    expect(mockWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        err,
        artistName: params.artistName,
        trackName: params.trackName,
      }),
      "lrclib lookup failed",
    );
  });

  it("logs warn and returns null when JSON parse fails", async () => {
    mockFetch.mockReturnValue(
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.reject(new SyntaxError("unexpected token")),
      }),
    );
    const result = await fetchLyrics(params);
    expect(result).toBeNull();
    expect(mockWarn).toHaveBeenCalledOnce();
    expect(mockWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.any(SyntaxError),
        artistName: params.artistName,
        trackName: params.trackName,
      }),
      "lrclib lookup failed",
    );
  });

  it("logs warn and returns null when response body fails schema validation", async () => {
    mockFetch.mockReturnValue(response(200, { id: 1, unexpected: true }));
    const result = await fetchLyrics(params);
    expect(result).toBeNull();
    expect(mockWarn).toHaveBeenCalledOnce();
    expect(mockWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        artistName: params.artistName,
        trackName: params.trackName,
      }),
      "lrclib lookup failed",
    );
  });
});
