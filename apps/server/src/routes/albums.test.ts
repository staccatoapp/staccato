import { describe, it, expect, vi, beforeEach } from "vitest";
import * as usersQueries from "../db/queries/users.js";
import albumRoutes from "./albums.js";
import { buildApp } from "./__fixtures__/app.js";

// albums.ts pulls in the DB client, cover-art store, MusicBrainz client and the
// session plugin at import time. Stub them so the routes can be registered in
// isolation — for the admin-gated routes the handler never runs (requireAdmin
// rejects first), so these only need to exist, not behave.
vi.mock("fastify-plugin", () => ({ default: (fn: unknown) => fn }));
vi.mock("@fastify/secure-session", () => ({ default: vi.fn() }));
vi.mock("../db/queries/users.js");
vi.mock("../db/queries/albums.js", () => ({
  getAlbumById: vi.fn(),
  getAlbumByMbid: vi.fn(),
  getAlbumWithArtistDetails: vi.fn(),
}));
vi.mock("../db/queries/album-edit.js", () => ({
  applyAlbumEdit: vi.fn(),
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
  cacheCoverFromUrl: vi.fn(),
  isLocalCoverUrl: (v: unknown) =>
    typeof v === "string" && v.startsWith("/metadata/covers/"),
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

import {
  getAlbumById,
  getAlbumWithArtistDetails,
} from "../db/queries/albums.js";
import { applyAlbumEdit } from "../db/queries/album-edit.js";
import { cacheCoverFromUrl } from "../coverart/store.js";

// A syntactically valid cuid2 album id (passes the route's isCuid check).
const ALBUM_ID = "abcdefghijklmnopqrstuvwx";

// Build an app that simulates requireAuth (sets request.userId) then mounts the
// album routes, whose admin scope adds requireAdmin on top.

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
    const app = buildApp(albumRoutes);
    const res = await app.inject({
      method: method as "PATCH" | "POST",
      url,
      payload: {},
    });
    expect(res.statusCode).toBe(403);
  });

  it("lets an admin through the edit route (past requireAdmin)", async () => {
    asAdmin(true);
    const app = buildApp(albumRoutes);
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
});

describe("PATCH /:albumId edit persistence", () => {
  beforeEach(() => vi.clearAllMocks());

  const validBody = {
    title: "New Title",
    artistName: "New Artist",
    releaseYear: 2021,
    coverArtUrl: null,
    tracks: [],
  };

  it("returns 404 when the album does not exist", async () => {
    asAdmin(true);
    vi.mocked(getAlbumById).mockReturnValue(undefined);
    const app = buildApp(albumRoutes);
    const res = await app.inject({
      method: "PATCH",
      url: `/${ALBUM_ID}`,
      payload: validBody,
    });
    expect(res.statusCode).toBe(404);
    expect(applyAlbumEdit).not.toHaveBeenCalled();
  });

  it("returns 400 on a malformed body", async () => {
    asAdmin(true);
    vi.mocked(getAlbumById).mockReturnValue({ id: ALBUM_ID } as never);
    const app = buildApp(albumRoutes);
    const res = await app.inject({
      method: "PATCH",
      url: `/${ALBUM_ID}`,
      payload: { title: "missing the rest" },
    });
    expect(res.statusCode).toBe(400);
    expect(applyAlbumEdit).not.toHaveBeenCalled();
  });

  it("persists a valid edit and returns the AlbumEditResponse shape", async () => {
    asAdmin(true);
    vi.mocked(getAlbumById).mockReturnValue({
      id: ALBUM_ID,
      coverArtUrl: null,
    } as never);
    vi.mocked(applyAlbumEdit).mockReturnValue({
      updatedTracks: 3,
      removedTracks: 1,
      attachedTracks: 2,
    });
    const app = buildApp(albumRoutes);
    const res = await app.inject({
      method: "PATCH",
      url: `/${ALBUM_ID}`,
      payload: validBody,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      ok: true,
      albumId: ALBUM_ID,
      updatedTracks: 3,
      removedTracks: 1,
      attachedTracks: 2,
    });
    expect(cacheCoverFromUrl).not.toHaveBeenCalled();
  });

  it("downloads + caches an external cover and persists the local path", async () => {
    asAdmin(true);
    vi.mocked(getAlbumById).mockReturnValue({
      id: ALBUM_ID,
      coverArtUrl: null,
    } as never);
    vi.mocked(cacheCoverFromUrl).mockResolvedValue(
      "/metadata/covers/album-x.jpg",
    );
    vi.mocked(applyAlbumEdit).mockReturnValue({
      updatedTracks: 0,
      removedTracks: 0,
      attachedTracks: 0,
    });
    const app = buildApp(albumRoutes);
    const res = await app.inject({
      method: "PATCH",
      url: `/${ALBUM_ID}`,
      payload: { ...validBody, coverArtUrl: "https://img.example/cover.jpg" },
    });
    expect(res.statusCode).toBe(200);
    expect(cacheCoverFromUrl).toHaveBeenCalledWith(
      ALBUM_ID,
      "https://img.example/cover.jpg",
    );
    expect(vi.mocked(applyAlbumEdit).mock.calls[0]?.[1].coverArtUrl).toBe(
      "/metadata/covers/album-x.jpg",
    );
  });

  it("keeps the existing cover when caching fails", async () => {
    asAdmin(true);
    vi.mocked(getAlbumById).mockReturnValue({
      id: ALBUM_ID,
      coverArtUrl: "/metadata/covers/album-x.jpg",
    } as never);
    vi.mocked(cacheCoverFromUrl).mockResolvedValue(null);
    vi.mocked(applyAlbumEdit).mockReturnValue({
      updatedTracks: 0,
      removedTracks: 0,
      attachedTracks: 0,
    });
    const app = buildApp(albumRoutes);
    const res = await app.inject({
      method: "PATCH",
      url: `/${ALBUM_ID}`,
      payload: { ...validBody, coverArtUrl: "https://img.example/bad.jpg" },
    });
    expect(res.statusCode).toBe(200);
    expect(vi.mocked(applyAlbumEdit).mock.calls[0]?.[1].coverArtUrl).toBe(
      "/metadata/covers/album-x.jpg",
    );
  });

  it("returns 500 when persistence throws", async () => {
    asAdmin(true);
    vi.mocked(getAlbumById).mockReturnValue({
      id: ALBUM_ID,
      coverArtUrl: null,
    } as never);
    vi.mocked(applyAlbumEdit).mockImplementation(() => {
      throw new Error("boom");
    });
    const app = buildApp(albumRoutes);
    const res = await app.inject({
      method: "PATCH",
      url: `/${ALBUM_ID}`,
      payload: validBody,
    });
    expect(res.statusCode).toBe(500);
  });
});

describe("GET /:albumKey stays public", () => {
  beforeEach(() => vi.clearAllMocks());

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
    const app = buildApp(albumRoutes);
    const res = await app.inject({ method: "GET", url: `/${ALBUM_ID}` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ source: "local" });
  });
});
