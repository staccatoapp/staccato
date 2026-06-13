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
// Keep shouldRecordListen real; only mock the fire-and-forget recordListen.
vi.mock("../scrobbling/dispatch.js", async (importActual) => {
  const actual =
    await importActual<typeof import("../scrobbling/dispatch.js")>();
  return { ...actual, recordListen: vi.fn().mockResolvedValue(undefined) };
});

import {
  getOrCreatePlaybackSession,
  updatePlaybackSession,
  type PlaybackSessionRow,
} from "../db/queries/playback-session.js";
import { getPlaybackTracksByIds } from "../db/queries/tracks.js";
import {
  groupCreditsByTrack,
  listTrackArtistsForTracks,
} from "../db/queries/track-artists.js";
import { resolveAlbumCoverNow } from "../coverart/store.js";
import { recordListen } from "../scrobbling/dispatch.js";

function makeSession(
  overrides: Partial<PlaybackSessionRow> = {},
): PlaybackSessionRow {
  return {
    id: "s1",
    userId: "user-1",
    playbackSourceId: null,
    trackQueue: [],
    currentTrackIndex: 0,
    currentTrackPositionInSeconds: 0,
    currentTrackAccumulatedPlayTimeInSeconds: 0,
    isPlaying: false,
    currentTrackListenEventCreated: false,
    ...overrides,
  };
}

function setupStateMocks(sessionState: PlaybackSessionRow) {
  vi.mocked(getOrCreatePlaybackSession).mockReturnValue(sessionState);
  vi.mocked(updatePlaybackSession).mockReturnValue(makeSession());
  vi.mocked(getPlaybackTracksByIds).mockReturnValue([]);
  vi.mocked(listTrackArtistsForTracks).mockReturnValue([]);
  vi.mocked(groupCreditsByTrack).mockReturnValue(new Map());
  vi.mocked(resolveAlbumCoverNow).mockReturnValue(null);
}

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

describe("PUT /session/state — scrobble dedup", () => {
  beforeEach(() => vi.clearAllMocks());

  it("preserves currentTrackListenEventCreated=true when client sends false", async () => {
    // Simulates a concurrent poll racing in with a stale false value after the
    // server already set the flag true for this track.
    setupStateMocks(makeSession({ currentTrackListenEventCreated: true }));
    const app = buildApp(playbackRoutes);
    await app.inject({
      method: "PUT",
      url: "/session/state",
      payload: {
        isPlaying: true,
        currentTrackIndex: 0,
        currentTrackPositionInSeconds: 100,
        currentTrackAccumulatedPlayTimeInSeconds: 100,
        currentTrackListenEventCreated: false,
      },
    });
    expect(vi.mocked(updatePlaybackSession)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ currentTrackListenEventCreated: true }),
    );
  });

  it("sets currentTrackListenEventCreated=true when the scrobble threshold fires in the same request", async () => {
    // trackQueue is empty → currentTrackId is undefined → threshold is 240 s
    // (null duration). Accumulated 241 s > 240 s crosses the threshold.
    setupStateMocks(makeSession({ currentTrackListenEventCreated: false }));
    const app = buildApp(playbackRoutes);
    await app.inject({
      method: "PUT",
      url: "/session/state",
      payload: {
        isPlaying: true,
        currentTrackIndex: 0,
        currentTrackPositionInSeconds: 241,
        currentTrackAccumulatedPlayTimeInSeconds: 241,
        currentTrackListenEventCreated: false,
      },
    });
    expect(vi.mocked(updatePlaybackSession)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ currentTrackListenEventCreated: true }),
    );
  });

  it("keeps currentTrackListenEventCreated=false when threshold is not reached and client sends false", async () => {
    setupStateMocks(makeSession({ currentTrackListenEventCreated: false }));
    const app = buildApp(playbackRoutes);
    await app.inject({
      method: "PUT",
      url: "/session/state",
      payload: {
        isPlaying: true,
        currentTrackIndex: 0,
        currentTrackPositionInSeconds: 100,
        currentTrackAccumulatedPlayTimeInSeconds: 100,
        currentTrackListenEventCreated: false,
      },
    });
    expect(vi.mocked(updatePlaybackSession)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ currentTrackListenEventCreated: false }),
    );
  });

  it("calls recordListen when a known track crosses the threshold", async () => {
    setupStateMocks(
      makeSession({
        currentTrackListenEventCreated: false,
        trackQueue: ["track-1"],
      }),
    );
    // Provide duration so shouldRecordListen gets real threshold (200/2 = 100 s).
    vi.mocked(getPlaybackTracksByIds).mockReturnValue([
      {
        id: "track-1",
        title: "Test",
        trackNumber: null,
        discNumber: null,
        artistName: null,
        albumId: null,
        releaseGroupMbid: null,
        coverArtUrl: null,
        durationSeconds: 200,
      },
    ]);
    const app = buildApp(playbackRoutes);
    await app.inject({
      method: "PUT",
      url: "/session/state",
      payload: {
        isPlaying: true,
        currentTrackIndex: 0,
        currentTrackPositionInSeconds: 101,
        currentTrackAccumulatedPlayTimeInSeconds: 101,
        currentTrackListenEventCreated: false,
      },
    });
    expect(vi.mocked(recordListen)).toHaveBeenCalledWith(
      "user-1",
      "track-1",
      expect.anything(),
    );
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
