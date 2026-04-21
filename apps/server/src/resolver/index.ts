import { and, eq, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { albums } from "../db/schema/albums.js";
import { artists } from "../db/schema/artists.js";
import { tracks } from "../db/schema/tracks.js";
import {
  searchRecording,
  searchRelease,
  throttledFetch,
} from "../musicbrainz/client.js";

export interface ResolutionProgress {
  running: boolean;
  resolved: number;
  failed: number;
  total: number;
  startedAt: Date | null;
  completedAt: Date | null;
}

export let resolutionProgress: ResolutionProgress = {
  running: false,
  resolved: 0,
  failed: 0,
  total: 0,
  startedAt: null,
  completedAt: null,
};

export async function startResolution(): Promise<void> {
  resolutionProgress = {
    running: true,
    resolved: 0,
    failed: 0,
    total: 0,
    startedAt: new Date(),
    completedAt: null,
  };

  try {
    await runPass1();
    await runPass2();
    await runPass3();
    dedupeArtists();
    resolutionProgress.completedAt = new Date();
  } catch (err) {
    console.error("[resolver] fatal error", err);
  } finally {
    resolutionProgress.running = false;
  }
}

async function runPass1(): Promise<void> {
  const unresolved = db
    .select({
      trackId: tracks.id,
      title: tracks.title,
      albumId: tracks.albumId,
      artistName: artists.name,
      albumTitle: albums.title,
      releaseYear: albums.releaseYear,
    })
    .from(tracks)
    .innerJoin(artists, eq(tracks.artistId, artists.id))
    .leftJoin(albums, eq(tracks.albumId, albums.id))
    .where(isNull(tracks.musicbrainzId))
    .all();

  resolutionProgress.total = unresolved.length;

  for (const track of unresolved) {
    const hint = track.albumTitle
      ? {
          albumTitle: track.albumTitle,
          releaseYear: track.releaseYear ?? undefined,
        }
      : undefined;

    const match = await searchRecording(track.artistName, track.title, hint);
    if (match) {
      db.update(tracks)
        .set({ musicbrainzId: match.recordingMbid })
        .where(eq(tracks.id, track.trackId))
        .run();
      if (match.releaseMbid && track.albumId) {
        db.update(albums)
          .set({ musicbrainzId: match.releaseMbid })
          .where(
            and(eq(albums.id, track.albumId), isNull(albums.musicbrainzId)),
          )
          .run();
      }
      resolutionProgress.resolved++;
    } else {
      resolutionProgress.failed++;
    }
  }
}

async function runPass2(): Promise<void> {
  const unresolvedAlbums = db
    .select({
      albumId: albums.id,
      title: albums.title,
      artistName: artists.name,
    })
    .from(albums)
    .innerJoin(artists, eq(albums.artistId, artists.id))
    .where(isNull(albums.musicbrainzId))
    .all();

  for (const album of unresolvedAlbums) {
    const match = await searchRelease(album.title, album.artistName);
    if (match) {
      db.update(albums)
        .set({ musicbrainzId: match.releaseMbid })
        .where(eq(albums.id, album.albumId))
        .run();
    }
  }
}

async function runPass3(): Promise<void> {
  const needsArt = db
    .select({ albumId: albums.id, musicbrainzId: albums.musicbrainzId })
    .from(albums)
    .where(and(isNotNull(albums.musicbrainzId), isNull(albums.coverArtUrl)))
    .all();

  for (const album of needsArt) {
    try {
      const res = await throttledFetch(
        `https://coverartarchive.org/release/${album.musicbrainzId}/front`,
        { redirect: "manual" },
      );
      if (res.status === 307 || res.status === 302) {
        const location = res.headers.get("location");
        if (location) {
          db.update(albums)
            .set({ coverArtUrl: location })
            .where(eq(albums.id, album.albumId))
            .run();
        }
      } else {
        db.update(albums)
          .set({ coverArtUrl: "" })
          .where(eq(albums.id, album.albumId))
          .run();
      }
    } catch {
      // network error — leave null to retry next run
    }
  }
}

function dedupeArtists(): void {
  const dupes = db
    .select({
      musicbrainzId: artists.musicbrainzId,
      canonicalId: sql<string>`(SELECT id FROM artists a2 WHERE a2.musicbrainz_id = artists.musicbrainz_id ORDER BY a2.created_at ASC LIMIT 1)`,
    })
    .from(artists)
    .where(isNotNull(artists.musicbrainzId))
    .groupBy(artists.musicbrainzId)
    .having(sql`count(*) > 1`)
    .all();

  if (dupes.length === 0) return;

  db.transaction(() => {
    for (const { musicbrainzId, canonicalId } of dupes) {
      const dupeIds = db
        .select({ id: artists.id })
        .from(artists)
        .where(
          and(
            eq(artists.musicbrainzId, musicbrainzId!),
            ne(artists.id, canonicalId),
          ),
        )
        .all()
        .map((r) => r.id);

      for (const dupeId of dupeIds) {
        db.update(tracks)
          .set({ artistId: canonicalId })
          .where(eq(tracks.artistId, dupeId))
          .run();
        db.update(albums)
          .set({ artistId: canonicalId })
          .where(eq(albums.artistId, dupeId))
          .run();
        db.delete(artists).where(eq(artists.id, dupeId)).run();
      }
    }
  });
}
