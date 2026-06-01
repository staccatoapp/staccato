import { describe, it, expect, vi, beforeEach } from "vitest";
import playbackRoutes from "./playback.js";
import { buildApp } from "./__fixtures__/app.js";

vi.mock("../db/queries/playback-session.js");
vi.mock("../db/queries/tracks.js");
vi.mock("../db/queries/track-artists.js");
vi.mock("../db/queries/listening-history.js");
vi.mock("../db/queries/settings.js");
vi.mock("../listenbrainz/client.js");
vi.mock("../db/queries/track-lyrics.js");
vi.mock("../lyrics/client.js");
vi.mock("../coverart/store.js");

describe("POST /session/queue", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 on invalid body", async () => {
    const app = buildApp(playbackRoutes);
    const res = await app.inject({
      method: "POST",
      url: "/session/queue",
      payload: { notTrackIds: true },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("PUT /session/queue", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 on invalid body", async () => {
    const app = buildApp(playbackRoutes);
    const res = await app.inject({
      method: "PUT",
      url: "/session/queue",
      payload: { notTrackIds: true },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("PUT /session/state", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 on invalid body", async () => {
    const app = buildApp(playbackRoutes);
    const res = await app.inject({
      method: "PUT",
      url: "/session/state",
      payload: { notValid: true },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("PUT /session/play", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 on invalid body", async () => {
    const app = buildApp(playbackRoutes);
    const res = await app.inject({
      method: "PUT",
      url: "/session/play",
      payload: { notValid: true },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("GET /lyrics", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 when trackId query param is missing", async () => {
    const app = buildApp(playbackRoutes);
    const res = await app.inject({
      method: "GET",
      url: "/lyrics",
    });
    expect(res.statusCode).toBe(400);
  });
});
