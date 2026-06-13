import { describe, it, expect, vi, beforeEach } from "vitest";
import playbackRoutes from "./playback.js";
import { buildApp } from "./__fixtures__/app.js";
import { getOrCreatePlaybackSession } from "../db/queries/playback-session.js";
import { getPlaybackTracksByIds } from "../db/queries/tracks.js";
import {
  groupCreditsByTrack,
  listTrackArtistsForTracks,
} from "../db/queries/track-artists.js";
import { resolveAlbumCoverNow } from "../coverart/store.js";

vi.mock("../db/queries/playback-session.js");
vi.mock("../db/queries/tracks.js");
vi.mock("../db/queries/track-artists.js");
vi.mock("../db/queries/listening-history.js");
vi.mock("../db/queries/settings.js");
vi.mock("../listenbrainz/client.js");
vi.mock("../db/queries/track-lyrics.js");
vi.mock("../lyrics/client.js");
vi.mock("../coverart/store.js");

describe("GET /session", () => {
  beforeEach(() => vi.clearAllMocks());

  it("includes albumTitle on each queue track", async () => {
    vi.mocked(getOrCreatePlaybackSession).mockReturnValue({
      id: "ps-1",
      userId: "user-1",
      playbackSourceId: null,
      trackQueue: ["t1"],
      currentTrackIndex: 0,
      currentTrackPositionInSeconds: 0,
      currentTrackAccumulatedPlayTimeInSeconds: 0,
      currentTrackListenEventCreated: false,
      isPlaying: false,
    });
    vi.mocked(getPlaybackTracksByIds).mockReturnValue([
      {
        id: "t1",
        title: "Dreams",
        trackNumber: 2,
        discNumber: 1,
        artistName: "Fleetwood Mac",
        albumId: "a1",
        albumTitle: "Rumours",
        releaseGroupMbid: null,
        coverArtUrl: null,
        durationSeconds: 254,
      },
    ]);
    vi.mocked(listTrackArtistsForTracks).mockReturnValue([]);
    vi.mocked(groupCreditsByTrack).mockReturnValue(new Map());
    vi.mocked(resolveAlbumCoverNow).mockReturnValue(null);

    const app = buildApp(playbackRoutes);
    const res = await app.inject({ method: "GET", url: "/session" });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.trackQueue).toHaveLength(1);
    expect(body.trackQueue[0].albumTitle).toBe("Rumours");
  });
});

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
