import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTestDb,
  seedAlbum,
  seedArtist,
  seedTrack,
  seedUser,
} from "../__fixtures__/db.js";
import { listeningHistory } from "../schema/listening-history.js";

let testDb: ReturnType<typeof createTestDb>;

vi.mock("../client.js", () => ({
  get db() {
    return testDb;
  },
}));

import {
  getRecentlyPlayedSources,
  insertListenEvent,
} from "./listening-history.js";

let userId: string;
let trackId: string;

/** Insert a listen row with an explicit listenedAt (seconds) and source. */
function seedListen(opts: {
  listenedAt: number;
  sourceType?: "album" | "playlist" | null;
  sourceId?: string | null;
}): void {
  testDb
    .insert(listeningHistory)
    .values({
      userId,
      trackId,
      listenedAt: opts.listenedAt,
      sourceType: opts.sourceType ?? null,
      sourceId: opts.sourceId ?? null,
    })
    .run();
}

beforeEach(() => {
  testDb = createTestDb();
  userId = seedUser();
  const artistId = seedArtist();
  const albumId = seedAlbum(artistId);
  trackId = seedTrack(artistId, albumId, { filePath: "/m/1.flac" });
});

describe("insertListenEvent — source", () => {
  it("persists the source when one is given", () => {
    insertListenEvent(userId, trackId, { type: "playlist", id: "pl-1" });
    const row = testDb.select().from(listeningHistory).get();
    expect(row?.sourceType).toBe("playlist");
    expect(row?.sourceId).toBe("pl-1");
  });

  it("leaves source null when none is given", () => {
    insertListenEvent(userId, trackId);
    const row = testDb.select().from(listeningHistory).get();
    expect(row?.sourceType).toBeNull();
    expect(row?.sourceId).toBeNull();
  });
});

describe("getRecentlyPlayedSources", () => {
  it("returns distinct sources ordered by most-recent listen", () => {
    seedListen({ listenedAt: 100, sourceType: "album", sourceId: "al-1" });
    seedListen({ listenedAt: 200, sourceType: "playlist", sourceId: "pl-1" });
    seedListen({ listenedAt: 300, sourceType: "album", sourceId: "al-2" });

    const result = getRecentlyPlayedSources(userId, 10);
    expect(result.map((r) => r.sourceId)).toEqual(["al-2", "pl-1", "al-1"]);
    expect(result[0]).toMatchObject({
      sourceType: "album",
      sourceId: "al-2",
      lastListenedAtMs: 300_000,
    });
  });

  it("collapses repeated plays of one source to its latest listen", () => {
    seedListen({ listenedAt: 100, sourceType: "album", sourceId: "al-1" });
    seedListen({ listenedAt: 400, sourceType: "album", sourceId: "al-1" });
    seedListen({ listenedAt: 200, sourceType: "playlist", sourceId: "pl-1" });

    const result = getRecentlyPlayedSources(userId, 10);
    expect(result.map((r) => r.sourceId)).toEqual(["al-1", "pl-1"]);
    expect(result[0]?.lastListenedAtMs).toBe(400_000);
  });

  it("excludes contextless (null-source) plays", () => {
    seedListen({ listenedAt: 500, sourceType: null, sourceId: null });
    seedListen({ listenedAt: 100, sourceType: "album", sourceId: "al-1" });

    const result = getRecentlyPlayedSources(userId, 10);
    expect(result.map((r) => r.sourceId)).toEqual(["al-1"]);
  });

  it("respects the limit", () => {
    seedListen({ listenedAt: 100, sourceType: "album", sourceId: "al-1" });
    seedListen({ listenedAt: 200, sourceType: "album", sourceId: "al-2" });
    seedListen({ listenedAt: 300, sourceType: "album", sourceId: "al-3" });

    expect(getRecentlyPlayedSources(userId, 2)).toHaveLength(2);
  });

  it("scopes to the given user", () => {
    seedListen({ listenedAt: 100, sourceType: "album", sourceId: "al-1" });
    const otherUser = seedUser("other");
    expect(getRecentlyPlayedSources(otherUser, 10)).toHaveLength(0);
  });
});
