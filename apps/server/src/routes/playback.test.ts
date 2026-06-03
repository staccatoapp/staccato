import { describe, it, expect, vi, beforeEach } from "vitest";

let testDb: ReturnType<typeof createTestDb>;

vi.mock("../db/client.js", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("../scrobbling/dispatch.js");
vi.mock("../coverart/store.js", () => ({
  resolveAlbumCoverNow: vi.fn(() => null),
}));
vi.mock("../db/queries/track-lyrics.js");
vi.mock("../lyrics/client.js");

import playbackRoutes from "./playback.js";
import { buildApp } from "./__fixtures__/app.js";
import { recordListen } from "../scrobbling/dispatch.js";
import {
  createTestDb,
  seedArtist,
  seedAlbum,
  seedTrack,
  seedUser,
} from "../db/__fixtures__/db.js";

beforeEach(() => {
  testDb = createTestDb();
  vi.clearAllMocks();
});

describe("POST /session/queue", () => {
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
  it("returns 400 when trackId query param is missing", async () => {
    const app = buildApp(playbackRoutes);
    const res = await app.inject({
      method: "GET",
      url: "/lyrics",
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("PUT /session/state — scrobble threshold logic", () => {
  let userId: string;
  let trackId: string;

  beforeEach(() => {
    userId = seedUser();
    const artistId = seedArtist();
    const albumId = seedAlbum(artistId);
    // seedTrack creates a track with durationSeconds: 200
    // threshold = min(240, 200/2) = 100 s
    trackId = seedTrack(artistId, albumId);
    vi.mocked(recordListen).mockResolvedValue(undefined);
  });

  it("does not call recordListen when accumulated time is below threshold", async () => {
    const app = buildApp(playbackRoutes, userId);
    await app.inject({
      method: "PUT",
      url: "/session/play",
      payload: { trackIds: [trackId], startIndex: 0 },
    });
    const res = await app.inject({
      method: "PUT",
      url: "/session/state",
      payload: {
        isPlaying: true,
        currentTrackIndex: 0,
        currentTrackPositionInSeconds: 99,
        currentTrackAccumulatedPlayTimeInSeconds: 99,
      },
    });
    expect(res.statusCode).toBe(200);
    expect(vi.mocked(recordListen)).not.toHaveBeenCalled();
    expect(res.json().currentTrackListenEventCreated).toBe(false);
  });

  it("calls recordListen when accumulated time exceeds threshold", async () => {
    const app = buildApp(playbackRoutes, userId);
    await app.inject({
      method: "PUT",
      url: "/session/play",
      payload: { trackIds: [trackId], startIndex: 0 },
    });
    const res = await app.inject({
      method: "PUT",
      url: "/session/state",
      payload: {
        isPlaying: true,
        currentTrackIndex: 0,
        currentTrackPositionInSeconds: 101,
        currentTrackAccumulatedPlayTimeInSeconds: 101,
      },
    });
    expect(res.statusCode).toBe(200);
    expect(vi.mocked(recordListen)).toHaveBeenCalledOnce();
    expect(vi.mocked(recordListen)).toHaveBeenCalledWith(
      userId,
      trackId,
      expect.anything(),
    );
    expect(res.json().currentTrackListenEventCreated).toBe(true);
  });

  it("does not call recordListen a second time after the dedup gate is set", async () => {
    const app = buildApp(playbackRoutes, userId);
    await app.inject({
      method: "PUT",
      url: "/session/play",
      payload: { trackIds: [trackId], startIndex: 0 },
    });
    // First state update: above threshold → triggers scrobble, sets dedup gate
    await app.inject({
      method: "PUT",
      url: "/session/state",
      payload: {
        isPlaying: true,
        currentTrackIndex: 0,
        currentTrackPositionInSeconds: 101,
        currentTrackAccumulatedPlayTimeInSeconds: 101,
      },
    });
    vi.mocked(recordListen).mockClear();
    // Second state update: same conditions, but dedup gate blocks another scrobble
    const res = await app.inject({
      method: "PUT",
      url: "/session/state",
      payload: {
        isPlaying: true,
        currentTrackIndex: 0,
        currentTrackPositionInSeconds: 150,
        currentTrackAccumulatedPlayTimeInSeconds: 150,
      },
    });
    expect(res.statusCode).toBe(200);
    expect(vi.mocked(recordListen)).not.toHaveBeenCalled();
    expect(res.json().currentTrackListenEventCreated).toBe(true);
  });

  it("does not call recordListen when currentTrackIndex is out of bounds", async () => {
    const app = buildApp(playbackRoutes, userId);
    // Queue has 1 track at index 0; index 1 is out of bounds
    await app.inject({
      method: "PUT",
      url: "/session/play",
      payload: { trackIds: [trackId], startIndex: 0 },
    });
    // No track at index 1 → duration unknown → threshold = 480/2 = 240 s
    const res = await app.inject({
      method: "PUT",
      url: "/session/state",
      payload: {
        isPlaying: true,
        currentTrackIndex: 1,
        currentTrackPositionInSeconds: 241,
        currentTrackAccumulatedPlayTimeInSeconds: 241,
      },
    });
    expect(res.statusCode).toBe(200);
    expect(vi.mocked(recordListen)).not.toHaveBeenCalled();
    // Session still marks listen event created even without a valid track (warn path)
    expect(res.json().currentTrackListenEventCreated).toBe(true);
  });
});
