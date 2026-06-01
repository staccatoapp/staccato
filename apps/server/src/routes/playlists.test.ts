import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, seedPlaylist, seedUser } from "../db/__fixtures__/db.js";

let testDb: ReturnType<typeof createTestDb>;

vi.mock("../db/client.js", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("../coverart/store.js", () => ({
  resolveAlbumCoverNow: vi.fn(() => null),
}));

import playlistRoutes from "./playlists.js";
import { buildApp } from "./__fixtures__/app.js";

let userAId: string;
let userBId: string;
let playlistId: string;

beforeEach(() => {
  testDb = createTestDb();
  userAId = seedUser("alice");
  userBId = seedUser("bob");
  playlistId = seedPlaylist(userAId, "Alice's Playlist");
});

describe("GET /:id — cross-user isolation", () => {
  it("returns 403 when requester is not the playlist owner", async () => {
    const app = buildApp(playlistRoutes, userBId);
    const res = await app.inject({ method: "GET", url: `/${playlistId}` });
    expect(res.statusCode).toBe(403);
  });

  it("returns 200 when requester is the playlist owner", async () => {
    const app = buildApp(playlistRoutes, userAId);
    const res = await app.inject({ method: "GET", url: `/${playlistId}` });
    expect(res.statusCode).toBe(200);
  });

  it("returns 404 for an unknown playlist id", async () => {
    const app = buildApp(playlistRoutes, userAId);
    const res = await app.inject({ method: "GET", url: "/nonexistent-id" });
    expect(res.statusCode).toBe(404);
  });
});

describe("PUT /:id — cross-user isolation", () => {
  it("returns 403 when requester is not the playlist owner", async () => {
    const app = buildApp(playlistRoutes, userBId);
    const res = await app.inject({
      method: "PUT",
      url: `/${playlistId}`,
      payload: { name: "Hijacked" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("returns 200 when requester is the playlist owner", async () => {
    const app = buildApp(playlistRoutes, userAId);
    const res = await app.inject({
      method: "PUT",
      url: `/${playlistId}`,
      payload: { name: "Renamed" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe("Renamed");
  });
});

describe("DELETE /:id — cross-user isolation", () => {
  it("returns 403 when requester is not the playlist owner", async () => {
    const app = buildApp(playlistRoutes, userBId);
    const res = await app.inject({ method: "DELETE", url: `/${playlistId}` });
    expect(res.statusCode).toBe(403);
  });

  it("returns 204 when requester is the playlist owner", async () => {
    const app = buildApp(playlistRoutes, userAId);
    const res = await app.inject({ method: "DELETE", url: `/${playlistId}` });
    expect(res.statusCode).toBe(204);
  });
});

describe("POST /:id/tracks — cross-user isolation", () => {
  it("returns 403 when requester is not the playlist owner", async () => {
    const app = buildApp(playlistRoutes, userBId);
    const res = await app.inject({
      method: "POST",
      url: `/${playlistId}/tracks`,
      payload: { trackIds: ["some-track-id"] },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("DELETE /:id/tracks/:entryId — cross-user isolation", () => {
  it("returns 403 when requester is not the playlist owner", async () => {
    const app = buildApp(playlistRoutes, userBId);
    const res = await app.inject({
      method: "DELETE",
      url: `/${playlistId}/tracks/some-entry-id`,
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("GET / — list scoping", () => {
  it("returns only the requesting user's playlists", async () => {
    seedPlaylist(userBId, "Bob's Playlist");

    const app = buildApp(playlistRoutes, userAId);
    const res = await app.inject({ method: "GET", url: "/" });

    expect(res.statusCode).toBe(200);
    const { items } = res.json();
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe("Alice's Playlist");
  });
});

describe("POST / — validation", () => {
  it("returns 400 when name is missing", async () => {
    const app = buildApp(playlistRoutes, userAId);
    const res = await app.inject({
      method: "POST",
      url: "/",
      payload: { description: "no name provided" },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("PUT /:id — validation", () => {
  it("returns 400 on invalid body", async () => {
    const app = buildApp(playlistRoutes, userAId);
    const res = await app.inject({
      method: "PUT",
      url: `/${playlistId}`,
      payload: { name: 123 }, // name must be a string
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("POST /:id/tracks — validation", () => {
  it("returns 400 on invalid body", async () => {
    const app = buildApp(playlistRoutes, userAId);
    const res = await app.inject({
      method: "POST",
      url: `/${playlistId}/tracks`,
      payload: { notTrackIds: true },
    });
    expect(res.statusCode).toBe(400);
  });
});
