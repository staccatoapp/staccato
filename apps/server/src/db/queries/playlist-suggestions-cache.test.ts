import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, seedPlaylist, seedUser } from "../__fixtures__/db.js";

let testDb: ReturnType<typeof createTestDb>;

vi.mock("../client.js", () => ({
  get db() {
    return testDb;
  },
}));

import {
  claimSuggestionForRefresh,
  deleteSuggestionRow,
  findDueSuggestionRowIds,
  getSuggestionRow,
  markSuggestionStale,
  resetInflightSuggestionsOnBoot,
  upsertWarmingSuggestionRow,
  writeSuggestionError,
  writeSuggestionReady,
} from "./playlist-suggestions-cache.js";

let userId: string;
let playlistId: string;

beforeEach(() => {
  testDb = createTestDb();
  userId = seedUser();
  playlistId = seedPlaylist(userId);
});

describe("playlist-suggestions-cache queries", () => {
  it("upsert is idempotent on (userId, playlistId)", () => {
    upsertWarmingSuggestionRow(userId, playlistId, 1000);
    upsertWarmingSuggestionRow(userId, playlistId, 2000);
    const row = getSuggestionRow(userId, playlistId);
    expect(row?.status).toBe("warming");
    expect(row?.nextRefreshAt).toBe(1000); // second upsert is a no-op
  });

  it("claim flips inflight once", () => {
    upsertWarmingSuggestionRow(userId, playlistId, 1000);
    const row = getSuggestionRow(userId, playlistId)!;
    expect(claimSuggestionForRefresh(row.id, 5000)).not.toBeNull();
    expect(claimSuggestionForRefresh(row.id, 5000)).toBeNull(); // already inflight
  });

  it("findDueSuggestionRowIds returns only due, non-inflight rows", () => {
    upsertWarmingSuggestionRow(userId, playlistId, 1000);
    expect(findDueSuggestionRowIds(500)).toEqual([]); // not yet due
    expect(findDueSuggestionRowIds(1000)).toHaveLength(1); // due
    const row = getSuggestionRow(userId, playlistId)!;
    claimSuggestionForRefresh(row.id, 1000); // now inflight
    expect(findDueSuggestionRowIds(2000)).toEqual([]); // inflight excluded
  });

  it("writeSuggestionReady stores payload and schedules next refresh", () => {
    upsertWarmingSuggestionRow(userId, playlistId, 1000);
    const row = getSuggestionRow(userId, playlistId)!;
    claimSuggestionForRefresh(row.id, 1000);
    writeSuggestionReady(row.id, "[]", 2000, 9999);
    const after = getSuggestionRow(userId, playlistId)!;
    expect(after.status).toBe("ready");
    expect(after.payload).toBe("[]");
    expect(after.inflight).toBe(0);
    expect(after.nextRefreshAt).toBe(9999);
  });

  it("writeSuggestionError stores the message and clears inflight", () => {
    upsertWarmingSuggestionRow(userId, playlistId, 1000);
    const row = getSuggestionRow(userId, playlistId)!;
    claimSuggestionForRefresh(row.id, 1000);
    writeSuggestionError(row.id, "boom", 8888, 2000);
    const after = getSuggestionRow(userId, playlistId)!;
    expect(after.status).toBe("error");
    expect(after.lastError).toBe("boom");
    expect(after.inflight).toBe(0);
    expect(after.nextRefreshAt).toBe(8888);
  });

  it("markSuggestionStale pulls nextRefreshAt forward only when a row exists", () => {
    markSuggestionStale(userId, "absent", 9999); // no-op, no throw
    upsertWarmingSuggestionRow(userId, playlistId, 100000);
    markSuggestionStale(userId, playlistId, 3000);
    expect(getSuggestionRow(userId, playlistId)?.nextRefreshAt).toBe(3000);
  });

  it("resetInflightSuggestionsOnBoot clears stuck claims", () => {
    upsertWarmingSuggestionRow(userId, playlistId, 1000);
    const row = getSuggestionRow(userId, playlistId)!;
    claimSuggestionForRefresh(row.id, 1000);
    expect(getSuggestionRow(userId, playlistId)?.inflight).toBe(1);
    resetInflightSuggestionsOnBoot();
    expect(getSuggestionRow(userId, playlistId)?.inflight).toBe(0);
  });

  it("deleteSuggestionRow removes the row", () => {
    upsertWarmingSuggestionRow(userId, playlistId, 1000);
    const row = getSuggestionRow(userId, playlistId)!;
    deleteSuggestionRow(row.id);
    expect(getSuggestionRow(userId, playlistId)).toBeUndefined();
  });
});
