import { assert, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  createTestDb,
  seedAlbum,
  seedArtist,
  seedTrack,
  type TestDb,
} from "../db/__fixtures__/db.js";
import { tracks } from "../db/schema/index.js";
import { walkAudioFiles } from "./walk.js";
import { enqueueDiscovery, enqueueResolution } from "./queue.js";
import { reconcile } from "./reconcile.js";

let testDb: TestDb;

vi.mock("../db/client.js", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("./walk.js", () => ({
  walkAudioFiles: vi.fn(),
}));

vi.mock("./queue.js", () => ({
  enqueueDiscovery: vi.fn(),
  enqueueResolution: vi.fn(),
}));

vi.mock("../logger.js", () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

function mockDisk(...paths: string[]) {
  vi.mocked(walkAudioFiles).mockImplementation(async function* () {
    for (const p of paths) yield p;
  });
}

describe("reconcile", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.clearAllMocks();
  });

  it("enqueues discovery for a file on disk that is not in the DB", async () => {
    mockDisk("/music/new.flac");

    const result = await reconcile("/music");

    expect(enqueueDiscovery).toHaveBeenCalledOnce();
    expect(enqueueDiscovery).toHaveBeenCalledWith("/music/new.flac");
    expect(enqueueResolution).not.toHaveBeenCalled();
    expect(result).toEqual({ discovered: 1, pendingResolution: 0 });
  });

  it("marks a DB track pending removal when its file is missing from disk", async () => {
    const artistId = seedArtist();
    const albumId = seedAlbum(artistId);
    seedTrack(artistId, albumId, { filePath: "/music/old.flac" });
    mockDisk();

    const result = await reconcile("/music");

    const [row] = testDb
      .select({ pendingRemovalAt: tracks.pendingRemovalAt })
      .from(tracks)
      .where(eq(tracks.filePath, "/music/old.flac"))
      .all();
    assert(row !== undefined, "track row should exist in DB");
    expect(row.pendingRemovalAt).not.toBeNull();
    expect(enqueueResolution).not.toHaveBeenCalled();
    expect(result).toEqual({ discovered: 0, pendingResolution: 0 });
  });

  it("re-enqueues a resolving track straight to resolution when its file is still on disk", async () => {
    const artistId = seedArtist();
    const albumId = seedAlbum(artistId);
    seedTrack(artistId, albumId, { filePath: "/music/track.flac" });
    mockDisk("/music/track.flac");

    const result = await reconcile("/music");

    expect(enqueueResolution).toHaveBeenCalledOnce();
    expect(enqueueResolution).toHaveBeenCalledWith("/music/track.flac");
    expect(enqueueDiscovery).not.toHaveBeenCalled();
    expect(result).toEqual({ discovered: 0, pendingResolution: 1 });
  });
});
