import { describe, it, expect, vi, beforeEach } from "vitest";
import { Readable } from "node:stream";
import tracksRoutes from "./tracks.js";
import { buildApp } from "./__fixtures__/app.js";

vi.mock("../db/queries/tracks.js");
vi.mock("node:fs");

import * as tracksQueries from "../db/queries/tracks.js";
import fs from "node:fs";

const FILE_SIZE = 1000;

function mockTrack() {
  vi.mocked(tracksQueries.getTrackForStream).mockReturnValue({
    filePath: "/music/track.mp3",
    fileFormat: "mp3",
  });
  vi.mocked(fs.statSync).mockReturnValue({ size: FILE_SIZE } as fs.Stats);
  vi.mocked(fs.createReadStream).mockReturnValue(
    Readable.from(Buffer.alloc(0)) as unknown as fs.ReadStream,
  );
}

describe("GET /tracks/:id/stream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTrack();
  });

  it("returns 404 when track not found", async () => {
    vi.mocked(tracksQueries.getTrackForStream).mockReturnValue(undefined);
    const app = buildApp(tracksRoutes);
    const res = await app.inject({
      method: "GET",
      url: "/tracks/missing/stream",
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns 200 full file when no Range header", async () => {
    const app = buildApp(tracksRoutes);
    const res = await app.inject({ method: "GET", url: "/tracks/t1/stream" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-length"]).toBe(String(FILE_SIZE));
    expect(res.headers["accept-ranges"]).toBe("bytes");
  });

  it("returns 206 for a valid partial range", async () => {
    const app = buildApp(tracksRoutes);
    const res = await app.inject({
      method: "GET",
      url: "/tracks/t1/stream",
      headers: { range: "bytes=0-499" },
    });
    expect(res.statusCode).toBe(206);
    expect(res.headers["content-range"]).toBe("bytes 0-499/1000");
    expect(res.headers["content-length"]).toBe("500");
  });

  it("clamps end to fileSize-1 when end exceeds file size", async () => {
    const app = buildApp(tracksRoutes);
    const res = await app.inject({
      method: "GET",
      url: "/tracks/t1/stream",
      headers: { range: "bytes=0-99999999" },
    });
    expect(res.statusCode).toBe(206);
    expect(res.headers["content-range"]).toBe(
      `bytes 0-${FILE_SIZE - 1}/${FILE_SIZE}`,
    );
    expect(res.headers["content-length"]).toBe(String(FILE_SIZE));
  });

  it("returns 416 for NaN range (bytes=abc-def)", async () => {
    const app = buildApp(tracksRoutes);
    const res = await app.inject({
      method: "GET",
      url: "/tracks/t1/stream",
      headers: { range: "bytes=abc-def" },
    });
    expect(res.statusCode).toBe(416);
    expect(res.headers["content-range"]).toBe(`bytes */${FILE_SIZE}`);
  });

  it("returns 416 for negative start (bytes=-1-500)", async () => {
    const app = buildApp(tracksRoutes);
    const res = await app.inject({
      method: "GET",
      url: "/tracks/t1/stream",
      headers: { range: "bytes=-1-500" },
    });
    expect(res.statusCode).toBe(416);
    expect(res.headers["content-range"]).toBe(`bytes */${FILE_SIZE}`);
  });

  it("returns 416 when start is beyond file size", async () => {
    const app = buildApp(tracksRoutes);
    const res = await app.inject({
      method: "GET",
      url: "/tracks/t1/stream",
      headers: { range: `bytes=${FILE_SIZE}-${FILE_SIZE + 100}` },
    });
    expect(res.statusCode).toBe(416);
    expect(res.headers["content-range"]).toBe(`bytes */${FILE_SIZE}`);
  });

  it("returns 416 when start is greater than end", async () => {
    const app = buildApp(tracksRoutes);
    const res = await app.inject({
      method: "GET",
      url: "/tracks/t1/stream",
      headers: { range: "bytes=500-100" },
    });
    expect(res.statusCode).toBe(416);
    expect(res.headers["content-range"]).toBe(`bytes */${FILE_SIZE}`);
  });
});
