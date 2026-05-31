import { beforeEach, describe, it, expect, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  createTestDb,
  seedArtist,
  seedAlbum,
  seedTrack,
  type TestDb,
} from "../db/__fixtures__/db.js";
import { tracks } from "../db/schema/index.js";
import { discoverFile, resolveTrack } from "./worker.js";
import { libraryProgress, resetProgress } from "./state.js";
import { makeTags, makeCandidate, makeResolvedRelease } from "./__fixtures__/builders.js";
import { enqueueResolution, enqueueEnrichment } from "./queue.js";
import { extractTags } from "./evidence/tags.js";
import { fingerprintFile } from "./evidence/fingerprint.js";
import { commitResolution } from "./commit.js";
import { candidatesFromTags } from "./candidates/fromTags.js";
import { candidatesFromAcoustid } from "./candidates/fromAcoustid.js";
import { candidatesFromSearch } from "./candidates/fromSearch.js";
import { scoreCandidates, pickWinner } from "./scoring.js";
import { pickRelease } from "./graphWalk.js";
import { setAudioFingerprint } from "../db/queries/tracks.js";
import fs from "node:fs/promises";

let testDb: TestDb;

vi.mock("../db/client.js", () => ({
  get db() {
    return testDb;
  },
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

vi.mock("node:fs/promises", () => ({
  default: { stat: vi.fn() },
}));

vi.mock("./evidence/tags.js", () => ({ extractTags: vi.fn() }));
vi.mock("./evidence/fingerprint.js", () => ({ fingerprintFile: vi.fn() }));
vi.mock("./queue.js", () => ({
  enqueueResolution: vi.fn(),
  enqueueEnrichment: vi.fn(),
}));
vi.mock("./commit.js", () => ({ commitResolution: vi.fn() }));
vi.mock("./candidates/fromTags.js", () => ({ candidatesFromTags: vi.fn() }));
vi.mock("./candidates/fromAcoustid.js", () => ({ candidatesFromAcoustid: vi.fn() }));
vi.mock("./candidates/fromSearch.js", () => ({ candidatesFromSearch: vi.fn() }));
vi.mock("./scoring.js", () => ({
  scoreCandidates: vi.fn(),
  pickWinner: vi.fn(),
}));
vi.mock("./graphWalk.js", () => ({ pickRelease: vi.fn() }));
vi.mock("./mbLookup.js", () => ({ lookupRecordingRich: vi.fn() }));
vi.mock("../musicbrainz/client.js", () => ({
  normalizeString: vi.fn((s: string) => s),
}));

beforeEach(() => {
  testDb = createTestDb();
  resetProgress();
  libraryProgress.running = false;
  vi.clearAllMocks();
});

describe("discoverFile", () => {
  it("skips discovery when fs.stat throws", async () => {
    vi.mocked(fs.stat).mockRejectedValue(new Error("ENOENT"));

    await discoverFile("/music/missing.flac");

    expect(extractTags).not.toHaveBeenCalled();
    expect(enqueueResolution).not.toHaveBeenCalled();
    expect(libraryProgress.scanned).toBe(0);
  });

  it("returns early without re-extracting tags when track is resolved and file is unchanged", async () => {
    const artistId = seedArtist();
    const albumId = seedAlbum(artistId);
    const trackId = seedTrack(artistId, albumId, { filePath: "/music/track.flac" });
    // Promote to resolved with the same mtime/size the stat mock will return.
    testDb
      .update(tracks)
      .set({ resolutionStatus: "resolved", fileMtime: 1000, fileSizeBytes: 1_000_000 })
      .where(eq(tracks.id, trackId))
      .run();

    vi.mocked(fs.stat).mockResolvedValue({ size: 1_000_000, mtimeMs: 1000 } as any);

    await discoverFile("/music/track.flac");

    expect(extractTags).not.toHaveBeenCalled();
    expect(enqueueResolution).not.toHaveBeenCalled();
    expect(libraryProgress.scanned).toBe(0);
  });

  it("clears the pending-removal flag when a previously-missing file reappears", async () => {
    const artistId = seedArtist();
    const albumId = seedAlbum(artistId);
    const trackId = seedTrack(artistId, albumId, { filePath: "/music/track.flac" });
    testDb
      .update(tracks)
      .set({ pendingRemovalAt: Date.now() })
      .where(eq(tracks.id, trackId))
      .run();

    vi.mocked(fs.stat).mockResolvedValue({ size: 1_000_000, mtimeMs: 0 } as any);
    vi.mocked(extractTags).mockResolvedValue(makeTags());

    await discoverFile("/music/track.flac");

    const [row] = testDb
      .select({ pendingRemovalAt: tracks.pendingRemovalAt })
      .from(tracks)
      .where(eq(tracks.id, trackId))
      .all();
    expect(row?.pendingRemovalAt).toBeNull();
  });

  it("logs a warning and increments the failed counter when tag extraction throws", async () => {
    vi.mocked(fs.stat).mockResolvedValue({ size: 1_000_000, mtimeMs: 0 } as any);
    vi.mocked(extractTags).mockRejectedValue(new Error("corrupt file"));

    await discoverFile("/music/corrupt.flac");

    expect(enqueueResolution).not.toHaveBeenCalled();
    expect(libraryProgress.failed).toBe(1);
    expect(libraryProgress.scanned).toBe(0);
  });

  it("upserts the track, enqueues resolution, and increments the scanned counter for a new file", async () => {
    vi.mocked(fs.stat).mockResolvedValue({ size: 1_000_000, mtimeMs: 0 } as any);
    vi.mocked(extractTags).mockResolvedValue(makeTags());

    await discoverFile("/music/new.flac");

    expect(enqueueResolution).toHaveBeenCalledOnce();
    expect(enqueueResolution).toHaveBeenCalledWith("/music/new.flac");
    expect(libraryProgress.scanned).toBe(1);

    const rows = testDb
      .select({ filePath: tracks.filePath })
      .from(tracks)
      .where(eq(tracks.filePath, "/music/new.flac"))
      .all();
    expect(rows).toHaveLength(1);
  });
});
