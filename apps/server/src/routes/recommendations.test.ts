import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RecommendedTrack } from "@staccato/shared";
import recommendationRoutes from "./recommendations.js";
import { buildApp } from "./__fixtures__/app.js";

vi.mock("fastify-plugin", () => ({ default: (fn: unknown) => fn }));
vi.mock("@fastify/secure-session", () => ({ default: vi.fn() }));
vi.mock("../db/queries/settings.js");
vi.mock("../db/queries/recommendation-cache.js", () => ({
  findRowsForUserKind: vi.fn(),
  upsertWarmingRow: vi.fn(),
}));
vi.mock("../recommendations/source.js", () => ({
  listRegisteredSources: vi.fn(),
}));
vi.mock("../recommendations/in-library.js", () => ({
  refreshTracksInLibrary: vi.fn((tracks: unknown) => tracks),
  refreshPlaylistsInLibrary: vi.fn((playlists: unknown) => playlists),
}));
vi.mock("../recommendations/sources/index.js", () => ({}));
vi.mock("../logger.js", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { findRowsForUserKind } from "../db/queries/recommendation-cache.js";
import { listRegisteredSources } from "../recommendations/source.js";
import { getOrCreateUserSettings } from "../db/queries/settings.js";

const MOCK_SETTINGS = { listenbrainzToken: "tok", musicbrainzUsername: "u" };
const MOCK_SOURCE = {
  id: "src-1",
  kind: "cf-tracks",
  isEligible: () => true,
};

const makeRow = (overrides: Record<string, unknown> = {}) => ({
  id: "row-1",
  userId: "user-1",
  source: "src-1",
  kind: "cf-tracks",
  status: "ready",
  inflight: 0,
  payload: null,
  lastError: null,
  fetchedAt: null,
  nextRefreshAt: 0,
  createdAt: 0,
  updatedAt: 0,
  ...overrides,
});

const validTrack: RecommendedTrack = {
  recordingMbid: "mbid-1",
  title: "Song",
  artistName: "Artist",
  artistMbid: null,
  albumTitle: null,
  releaseGroupMbid: null,
  coverArtUrl: null,
  durationMs: null,
  inLibrary: false,
  localTrackId: null,
};

describe("GET /tracks — recommendation cache validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrCreateUserSettings).mockReturnValue(MOCK_SETTINGS as never);
    vi.mocked(listRegisteredSources).mockReturnValue([MOCK_SOURCE] as never);
  });

  it("returns no-token when no eligible sources exist", async () => {
    vi.mocked(listRegisteredSources).mockReturnValue([]);
    const app = buildApp(recommendationRoutes);
    const res = await app.inject({ method: "GET", url: "/tracks" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "no-token" });
  });

  it("returns warming when all rows have null payload", async () => {
    vi.mocked(findRowsForUserKind).mockReturnValue([
      makeRow({ status: "warming", payload: null }),
    ] as never);
    const app = buildApp(recommendationRoutes);
    const res = await app.inject({ method: "GET", url: "/tracks" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "warming" });
  });

  it("returns ready with data when payload matches schema", async () => {
    vi.mocked(findRowsForUserKind).mockReturnValue([
      makeRow({ payload: JSON.stringify([validTrack]) }),
    ] as never);
    const app = buildApp(recommendationRoutes);
    const res = await app.inject({ method: "GET", url: "/tracks" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ready", data: [validTrack] });
  });

  it("discards a payload that does not match the schema", async () => {
    const badPayload = JSON.stringify([{ notATrack: true }]);
    vi.mocked(findRowsForUserKind).mockReturnValue([
      makeRow({ payload: badPayload }),
    ] as never);
    const app = buildApp(recommendationRoutes);
    const res = await app.inject({ method: "GET", url: "/tracks" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ready", data: [] });
  });

  it("discards a payload that is not valid JSON", async () => {
    vi.mocked(findRowsForUserKind).mockReturnValue([
      makeRow({ payload: "{{not json}}" }),
    ] as never);
    const app = buildApp(recommendationRoutes);
    const res = await app.inject({ method: "GET", url: "/tracks" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ready", data: [] });
  });
});
