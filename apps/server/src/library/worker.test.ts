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

describe("resolveTrack", () => {
  it("returns without touching the file system when the track row is missing", async () => {
    await resolveTrack("/music/ghost.flac");

    expect(fs.stat).not.toHaveBeenCalled();
    expect(extractTags).not.toHaveBeenCalled();
    expect(libraryProgress.inFlight).toBe(0);
  });

  it("skips resolution and keeps inFlight balanced when fs.stat fails", async () => {
    const artistId = seedArtist();
    const albumId = seedAlbum(artistId);
    seedTrack(artistId, albumId, { filePath: "/music/track.flac" });
    vi.mocked(fs.stat).mockRejectedValue(new Error("ENOENT"));

    await resolveTrack("/music/track.flac");

    expect(extractTags).not.toHaveBeenCalled();
    expect(libraryProgress.failed).toBe(0);
    expect(libraryProgress.inFlight).toBe(0);
  });

  it("returns early without re-resolving when track is resolved and file is unchanged", async () => {
    const artistId = seedArtist();
    const albumId = seedAlbum(artistId);
    const trackId = seedTrack(artistId, albumId, { filePath: "/music/track.flac" });
    testDb
      .update(tracks)
      .set({ resolutionStatus: "resolved", fileMtime: 1000, fileSizeBytes: 1_000_000 })
      .where(eq(tracks.id, trackId))
      .run();

    vi.mocked(fs.stat).mockResolvedValue({ size: 1_000_000, mtimeMs: 1000 } as any);

    await resolveTrack("/music/track.flac");

    expect(extractTags).not.toHaveBeenCalled();
    expect(commitResolution).not.toHaveBeenCalled();
    expect(libraryProgress.inFlight).toBe(0);
  });

  it("marks the track failed when tag extraction throws during resolution", async () => {
    const artistId = seedArtist();
    const albumId = seedAlbum(artistId);
    const trackId = seedTrack(artistId, albumId, { filePath: "/music/track.flac" });

    vi.mocked(fs.stat).mockResolvedValue({ size: 1_000_000, mtimeMs: 0 } as any);
    vi.mocked(extractTags).mockRejectedValue(new Error("corrupt"));

    await resolveTrack("/music/track.flac");

    expect(libraryProgress.failed).toBe(1);
    const [row] = testDb
      .select({ resolutionStatus: tracks.resolutionStatus })
      .from(tracks)
      .where(eq(tracks.id, trackId))
      .all();
    expect(row?.resolutionStatus).toBe("failed");
  });

  it("takes the Picard fast-path, commits from tags, and enqueues enrichment when all MB IDs are present", async () => {
    const artistId = seedArtist();
    const albumId = seedAlbum(artistId);
    const trackId = seedTrack(artistId, albumId, { filePath: "/music/picard.flac" });

    vi.mocked(fs.stat).mockResolvedValue({ size: 1_000_000, mtimeMs: 0 } as any);
    vi.mocked(extractTags).mockResolvedValue(
      makeTags({
        mbRecordingId: "rec-mbid",
        mbAlbumId: "album-mbid",
        mbReleaseGroupId: "rg-mbid",
        mbAlbumArtistId: "artist-mbid",
      }),
    );

    await resolveTrack("/music/picard.flac");

    expect(commitResolution).toHaveBeenCalledOnce();
    expect(enqueueEnrichment).toHaveBeenCalledOnce();
    expect(enqueueEnrichment).toHaveBeenCalledWith(trackId, "/music/picard.flac", "rec-mbid");
    expect(libraryProgress.resolved).toBe(1);
    expect(libraryProgress.inFlight).toBe(0);
    // Picard fast-path must not fan out to fingerprint or candidate lookups.
    expect(fingerprintFile).not.toHaveBeenCalled();
    expect(candidatesFromTags).not.toHaveBeenCalled();
  });

  it("repoints the existing row to the new path when rename is detected via fingerprint match", async () => {
    const artistId = seedArtist();
    const albumId = seedAlbum(artistId);

    // Seed the original track (old path) and give it a chromaprint.
    const oldTrackId = seedTrack(artistId, albumId, { filePath: "/music/old.flac" });
    setAudioFingerprint(oldTrackId, "fp-abc123");

    // Seed the newly-discovered stub for the renamed file.
    const newTrackId = seedTrack(artistId, albumId, { filePath: "/music/new.flac" });

    vi.mocked(fs.stat).mockResolvedValue({ size: 1_000_000, mtimeMs: 0 } as any);
    vi.mocked(extractTags).mockResolvedValue(makeTags()); // no MB IDs → not Picard fast-path
    vi.mocked(fingerprintFile).mockResolvedValue({ fingerprint: "fp-abc123", duration: 200 });
    // Wire the resolution tail so finishResolution completes without crashing.
    vi.mocked(candidatesFromTags).mockResolvedValue([makeCandidate()]);
    vi.mocked(scoreCandidates).mockReturnValue([{ ...makeCandidate(), score: 0.9 }]);
    vi.mocked(pickWinner).mockReturnValue({ ...makeCandidate(), score: 0.9 });
    vi.mocked(pickRelease).mockReturnValue(makeResolvedRelease());

    await resolveTrack("/music/new.flac");

    // The new-path stub should be deleted.
    const newRows = testDb.select().from(tracks).where(eq(tracks.id, newTrackId)).all();
    expect(newRows).toHaveLength(0);

    // The old row should now carry the new file path.
    const [oldRow] = testDb
      .select({ filePath: tracks.filePath })
      .from(tracks)
      .where(eq(tracks.id, oldTrackId))
      .all();
    expect(oldRow?.filePath).toBe("/music/new.flac");
    expect(libraryProgress.resolved).toBe(1);
    expect(libraryProgress.inFlight).toBe(0);
  });

  it("marks the track failed when no candidates are found across all sources", async () => {
    const artistId = seedArtist();
    const albumId = seedAlbum(artistId);
    const trackId = seedTrack(artistId, albumId, { filePath: "/music/unmatched.flac" });

    vi.mocked(fs.stat).mockResolvedValue({ size: 1_000_000, mtimeMs: 0 } as any);
    vi.mocked(extractTags).mockResolvedValue(makeTags()); // no MB IDs → normal path
    vi.mocked(fingerprintFile).mockResolvedValue(null);
    vi.mocked(candidatesFromTags).mockResolvedValue([]);
    vi.mocked(candidatesFromAcoustid).mockResolvedValue([]);
    vi.mocked(candidatesFromSearch).mockResolvedValue([]);

    await resolveTrack("/music/unmatched.flac");

    expect(libraryProgress.failed).toBe(1);
    expect(libraryProgress.inFlight).toBe(0);
    const [row] = testDb
      .select({ resolutionStatus: tracks.resolutionStatus })
      .from(tracks)
      .where(eq(tracks.id, trackId))
      .all();
    expect(row?.resolutionStatus).toBe("failed");
  });

  it("increments the failed counter and keeps inFlight balanced on an unexpected crash", async () => {
    const artistId = seedArtist();
    const albumId = seedAlbum(artistId);
    seedTrack(artistId, albumId, { filePath: "/music/crash.flac" });

    vi.mocked(fs.stat).mockResolvedValue({ size: 1_000_000, mtimeMs: 0 } as any);
    vi.mocked(extractTags).mockResolvedValue(makeTags()); // no MB IDs → normal path
    vi.mocked(fingerprintFile).mockResolvedValue(null);
    // candidatesFromTags throws outside any try/catch in doResolve → propagates to resolveTrack's catch
    vi.mocked(candidatesFromTags).mockRejectedValue(new Error("unexpected network crash"));

    await resolveTrack("/music/crash.flac");

    expect(libraryProgress.failed).toBe(1);
    expect(libraryProgress.inFlight).toBe(0); // finally block always decrements
  });
});
