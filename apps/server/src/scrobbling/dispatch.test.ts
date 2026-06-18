import type { FastifyBaseLogger } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTestDb,
  seedArtist,
  seedTrack,
  seedUser,
} from "../db/__fixtures__/db.js";
import type { ScrobbleTarget } from "./target.js";

let testDb: ReturnType<typeof createTestDb>;

vi.mock("../db/client.js", () => ({
  get db() {
    return testDb;
  },
}));

// Isolate recordListen from the real target registry (and the barrel's
// import side-effect) by controlling the target list directly.
let registeredTargets: ScrobbleTarget[] = [];
vi.mock("./target.js", () => ({
  listRegisteredTargets: () => registeredTargets,
}));
vi.mock("./targets/index.js", () => ({}));

// Keep the real track queries (the fixtures use them) but let tests override
// the scrobble-metadata lookup to exercise the missing-metadata guard.
vi.mock("../db/queries/tracks.js", async (importActual) => {
  const actual = await importActual<typeof import("../db/queries/tracks.js")>();
  return { ...actual, getTrackForScrobble: vi.fn(actual.getTrackForScrobble) };
});

import { listeningHistory } from "../db/schema/listening-history.js";
import { listenScrobbles } from "../db/schema/listen-scrobbles.js";
import { getTrackForScrobble } from "../db/queries/tracks.js";
import { recordListen } from "./dispatch.js";

const log = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
} as unknown as FastifyBaseLogger;

function makeTarget(
  id: string,
  isEligible: boolean,
  submit: ScrobbleTarget["submit"] = vi.fn().mockResolvedValue(undefined),
): ScrobbleTarget {
  return {
    id,
    isEligible: () => isEligible,
    buildContext: () => ({}),
    submit,
  };
}

function listenRows() {
  return testDb.select().from(listeningHistory).all();
}

function scrobbleRows() {
  return testDb.select().from(listenScrobbles).all();
}

function seedPlayableTrack() {
  const artistId = seedArtist();
  return seedTrack(artistId, null);
}

beforeEach(() => {
  testDb = createTestDb();
  registeredTargets = [];
  vi.mocked(getTrackForScrobble).mockClear();
  vi.mocked(log.warn).mockClear();
  vi.mocked(log.error).mockClear();
});

describe("recordListen", () => {
  it("writes the local ledger row but no scrobbles when no target is eligible", async () => {
    registeredTargets = [makeTarget("listenbrainz", false)];
    const userId = seedUser();
    const trackId = seedPlayableTrack();

    await recordListen(userId, trackId, null, log);

    expect(listenRows()).toHaveLength(1);
    expect(scrobbleRows()).toHaveLength(0);
    expect(log.warn).toHaveBeenCalled();
  });

  it("stamps the ledger row with the play source", async () => {
    registeredTargets = [makeTarget("listenbrainz", false)];
    const userId = seedUser();
    const trackId = seedPlayableTrack();

    await recordListen(userId, trackId, { type: "album", id: "al-1" }, log);

    const rows = listenRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.sourceType).toBe("album");
    expect(rows[0]?.sourceId).toBe("al-1");
  });

  it("marks a scrobble delivered when the target submits successfully", async () => {
    const submit = vi.fn().mockResolvedValue(undefined);
    registeredTargets = [makeTarget("listenbrainz", true, submit)];
    const userId = seedUser();
    const trackId = seedPlayableTrack();

    await recordListen(userId, trackId, null, log);

    const rows = scrobbleRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.target).toBe("listenbrainz");
    expect(rows[0]?.status).toBe("delivered");
    expect(rows[0]?.lastError).toBeNull();
    // The submission carries the recorded listen's metadata.
    expect(submit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        artistName: "Test Artist",
        trackName: "Test Track",
        listenedAt: expect.any(Number),
        recordingMbid: null,
      }),
      log,
    );
  });

  it("marks a scrobble failed and logs when the target submit throws", async () => {
    const submit = vi.fn().mockRejectedValue(new Error("boom"));
    registeredTargets = [makeTarget("listenbrainz", true, submit)];
    const userId = seedUser();
    const trackId = seedPlayableTrack();

    await recordListen(userId, trackId, null, log);

    const rows = scrobbleRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("failed");
    expect(rows[0]?.lastError).toContain("boom");
    expect(log.error).toHaveBeenCalled();
  });

  it("dispatches to each target independently (one fails, one succeeds)", async () => {
    registeredTargets = [
      makeTarget("good", true, vi.fn().mockResolvedValue(undefined)),
      makeTarget("bad", true, vi.fn().mockRejectedValue(new Error("nope"))),
    ];
    const userId = seedUser();
    const trackId = seedPlayableTrack();

    await recordListen(userId, trackId, null, log);

    const byTarget = Object.fromEntries(
      scrobbleRows().map((r) => [r.target, r.status]),
    );
    expect(byTarget).toEqual({ good: "delivered", bad: "failed" });
  });

  it("does not submit when track metadata is missing", async () => {
    const submit = vi.fn().mockResolvedValue(undefined);
    registeredTargets = [makeTarget("listenbrainz", true, submit)];
    const userId = seedUser();
    const trackId = seedPlayableTrack();
    vi.mocked(getTrackForScrobble).mockReturnValueOnce(undefined);

    await recordListen(userId, trackId, null, log);

    expect(submit).not.toHaveBeenCalled();
    expect(listenRows()).toHaveLength(1);
    expect(scrobbleRows()).toHaveLength(0);
    expect(log.warn).toHaveBeenCalled();
  });
});
