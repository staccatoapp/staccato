import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import * as usersQueries from "../db/queries/users.js";
import albumRoutes from "./albums.js";

// albums.ts pulls in the DB client, cover-art store, MusicBrainz client and the
// session plugin at import time. Stub them so the routes can be registered in
// isolation — for the admin-gated routes the handler never runs (requireAdmin
// rejects first), so these only need to exist, not behave.
vi.mock("fastify-plugin", () => ({ default: (fn: unknown) => fn }));
vi.mock("@fastify/secure-session", () => ({ default: vi.fn() }));
vi.mock("../db/queries/users.js");
vi.mock("../db/queries/albums.js", () => ({
  getAlbumByMbid: vi.fn(),
  getAlbumWithArtistDetails: vi.fn(),
}));
vi.mock("../db/queries/tracks.js", () => ({
  getOrphanTracksInDirectories: vi.fn(() => []),
  getTrackFilePathsInAlbum: vi.fn(() => []),
  getTracksInAlbum: vi.fn(() => []),
}));
vi.mock("../db/queries/track-artists.js", () => ({
  groupCreditsByTrack: vi.fn(() => new Map()),
  listTrackArtistsForTracks: vi.fn(() => []),
}));
vi.mock("../db/queries/album-artists.js", () => ({
  listAlbumArtists: vi.fn(() => []),
}));
vi.mock("../coverart/store.js", () => ({
  ensureCoverOnDisk: vi.fn(),
  resolveAlbumCoverNow: vi.fn(() => null),
}));
vi.mock("../musicbrainz/client.js", () => ({
  lookupExternalAlbum: vi.fn(),
  lookupReleaseDetails: vi.fn(),
  searchReleasesForIdentify: vi.fn(),
  MB_PRIORITY: { INTERACTIVE: 0, PAGE_LOAD: 1 },
}));
vi.mock("../library/identify.js", () => ({
  applyAlbumIdentification: vi.fn(),
  confirmAlbumMatch: vi.fn(),
}));

import { getAlbumWithArtistDetails } from "../db/queries/albums.js";

// A syntactically valid cuid2 album id (matches the route's CUID2_RE).
const ALBUM_ID = "abcdefghijklmnopqrstuvwx";

// Build an app that simulates requireAuth (sets request.userId) then mounts the
// album routes, whose admin scope adds requireAdmin on top.
const buildApp = () => {
  const app = Fastify();
  app.addHook("preHandler", async (req) => {
    (req as { userId?: string }).userId = "user-1";
  });
  app.register(albumRoutes);
  return app;
};

const asAdmin = (isAdmin: boolean) =>
  vi
    .mocked(usersQueries.findUserById)
    .mockReturnValue({ id: "user-1", isAdmin } as never);

describe("album routes admin gating", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ["PATCH", `/${ALBUM_ID}`],
    ["POST", `/${ALBUM_ID}/identify`],
    ["POST", `/${ALBUM_ID}/confirm-match`],
  ])("returns 403 for a non-admin on %s %s", async (method, url) => {
    asAdmin(false);
    const app = buildApp();
    const res = await app.inject({
      method: method as "PATCH" | "POST",
      url,
      payload: {},
    });
    expect(res.statusCode).toBe(403);
  });

  it("lets an admin through the edit route (past requireAdmin)", async () => {
    asAdmin(true);
    const app = buildApp();
    // Empty body fails AlbumEditRequestSchema → 400. The point is it is NOT
    // 403, proving requireAdmin passed and the handler ran.
    const res = await app.inject({
      method: "PATCH",
      url: `/${ALBUM_ID}`,
      payload: {},
    });
    expect(res.statusCode).not.toBe(403);
    expect(res.statusCode).toBe(400);
  });

  it("keeps GET /:albumKey public for a non-admin", async () => {
    asAdmin(false);
    vi.mocked(getAlbumWithArtistDetails).mockReturnValue({
      id: ALBUM_ID,
      title: "Test Album",
      artistId: "artist-1",
      artistName: "Test Artist",
      releaseYear: 2020,
      releaseMbid: null,
      releaseGroupMbid: null,
      coverArtUrl: null,
      confidenceScore: null,
      pendingTrackCount: 0,
    } as never);
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: `/${ALBUM_ID}` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ source: "local" });
  });
});
