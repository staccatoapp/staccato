import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, seedAlbum, seedArtist } from "../db/__fixtures__/db.js";

let testDb: ReturnType<typeof createTestDb>;

vi.mock("../db/client.js", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("../coverart/store.js", () => ({
  resolveAlbumCoverNow: vi.fn(() => null),
}));

vi.mock("../artistimage/store.js", () => ({
  resolveArtistImageNow: vi.fn(() => null),
}));

import libraryRoutes from "./library.js";
import { buildApp } from "./__fixtures__/app.js";

beforeEach(() => {
  testDb = createTestDb();
});

describe("GET /albums — sorting", () => {
  // Artist order is the reverse of title order so a title sort is
  // distinguishable from the legacy artist-then-title default.
  function seedTwoAlbums() {
    const zee = seedArtist("Zee Artist");
    const aaa = seedArtist("Aaa Artist");
    seedAlbum(zee, "Apple", 2010);
    seedAlbum(aaa, "Banana", 1999);
  }

  it("sorts by title ascending when sort=title", async () => {
    seedTwoAlbums();
    const app = buildApp(libraryRoutes);
    const res = await app.inject({ method: "GET", url: "/albums?sort=title" });
    expect(res.statusCode).toBe(200);
    expect(res.json().items.map((i: { title: string }) => i.title)).toEqual([
      "Apple",
      "Banana",
    ]);
  });

  it("sorts by release year descending when sort=year", async () => {
    seedTwoAlbums();
    const app = buildApp(libraryRoutes);
    const res = await app.inject({ method: "GET", url: "/albums?sort=year" });
    expect(res.statusCode).toBe(200);
    expect(
      res.json().items.map((i: { releaseYear: number }) => i.releaseYear),
    ).toEqual([2010, 1999]);
  });

  it("sorts by artist name ascending when sort=artist", async () => {
    seedTwoAlbums();
    const app = buildApp(libraryRoutes);
    const res = await app.inject({ method: "GET", url: "/albums?sort=artist" });
    expect(res.statusCode).toBe(200);
    expect(
      res.json().items.map((i: { artistName: string }) => i.artistName),
    ).toEqual(["Aaa Artist", "Zee Artist"]);
  });

  it("falls back to recently-added (200, all items) for an invalid sort", async () => {
    seedTwoAlbums();
    const app = buildApp(libraryRoutes);
    const res = await app.inject({ method: "GET", url: "/albums?sort=bogus" });
    expect(res.statusCode).toBe(200);
    expect(res.json().items).toHaveLength(2);
    expect(res.json().total).toBe(2);
  });
});

describe("GET /artists — sorting", () => {
  it("sorts by name ascending when sort=title", async () => {
    seedArtist("Zed");
    seedArtist("Ann");
    const app = buildApp(libraryRoutes);
    const res = await app.inject({ method: "GET", url: "/artists?sort=title" });
    expect(res.statusCode).toBe(200);
    expect(res.json().items.map((i: { name: string }) => i.name)).toEqual([
      "Ann",
      "Zed",
    ]);
  });

  it("falls back to recently-added (200) for an invalid sort", async () => {
    seedArtist("Solo");
    const app = buildApp(libraryRoutes);
    const res = await app.inject({ method: "GET", url: "/artists?sort=bogus" });
    expect(res.statusCode).toBe(200);
    expect(res.json().total).toBe(1);
  });
});
