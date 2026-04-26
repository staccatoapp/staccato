// TODO - re-resolves are either leading to duplicates, or failing to resolve, for albums or artists with inconsistent naming (fuck you, Panic! At The Disco). it's driving me crazy

import { and, eq, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { albums } from "../db/schema/albums.js";
import { artists } from "../db/schema/artists.js";
import { tracks } from "../db/schema/tracks.js";
import {
  type MBReleaseTrack,
  lookupReleaseDetails,
  normalizeString,
  searchRecording,
  searchReleaseCandidates,
} from "../musicbrainz/client.js";
import { fingerprintFile, isFpcalcAvailable } from "../fingerprint/fpcalc.js";
import { lookupFingerprint } from "../fingerprint/acoustid.js";
import {
  fetchCoverArtUrl,
  fetchCoverArtUrlForGroup,
} from "../coverart/client.js";
import { throttledFetch } from "../musicbrainz/client.js";

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
  if (resolutionProgress.running) {
    console.log("[resolver] already running, skipping");
    return;
  }
  resolutionProgress = {
    running: true,
    resolved: 0,
    failed: 0,
    total: 0,
    startedAt: new Date(),
    completedAt: null,
  };

  try {
    await runAlbumFirstPass();
    await runRecordingSearchFallback();
    await runCoverArtRetryPass();
    await runFingerprintPass();
    await runAlbumBackfillFromTracks();
    dedupeArtists();
    await runArtistImagePass();
    resolutionProgress.completedAt = new Date();
  } catch (err) {
    console.error("[resolver] fatal error", err);
  } finally {
    resolutionProgress.running = false;
  }
}

async function runAlbumFirstPass(): Promise<void> {
  const countRow = db
    .select({ total: sql<number>`count(*)`.mapWith(Number) })
    .from(tracks)
    .where(isNull(tracks.musicbrainzId))
    .get();
  resolutionProgress.total = countRow?.total ?? 0;

  const unresolvedAlbums = db
    .select({
      albumId: albums.id,
      title: albums.title,
      artistId: albums.artistId,
      artistName: artists.name,
    })
    .from(albums)
    .innerJoin(artists, eq(albums.artistId, artists.id))
    .where(isNull(albums.musicbrainzId))
    .all();

  console.log(`[resolver] album-first pass: ${unresolvedAlbums.length} albums`);

  for (const album of unresolvedAlbums) {
    const localTracks = db
      .select({
        id: tracks.id,
        title: tracks.title,
        trackNumber: tracks.trackNumber,
        discNumber: tracks.discNumber,
      })
      .from(tracks)
      .where(
        and(eq(tracks.albumId, album.albumId), isNull(tracks.musicbrainzId)),
      )
      .all();

    if (localTracks.length === 0) continue;

    const candidates = await searchReleaseCandidates(
      album.title,
      album.artistName,
      localTracks.length,
    );
    const threshold = Math.ceil(localTracks.length / 2);

    for (const releaseMbid of candidates) {
      const details = await lookupReleaseDetails(releaseMbid);
      if (!details) continue;

      const matched = matchLocalTracks(localTracks, details.tracks);
      const matchCount = matched.filter((m) => m.mbTrack !== undefined).length;

      if (matchCount < threshold) continue;

      const albumResult = db
        .update(albums)
        .set({
          musicbrainzId: releaseMbid,
          ...(details.releaseName
            ? { canonicalTitle: details.releaseName }
            : {}),
        })
        .where(and(eq(albums.id, album.albumId), isNull(albums.musicbrainzId)))
        .run();
      if (albumResult.changes > 0) {
        void fetchAndStoreCoverArt(
          album.albumId,
          releaseMbid,
          details.releaseGroupMbid ?? undefined,
        );
      }

      for (const { localId, mbTrack } of matched) {
        if (mbTrack) {
          db.update(tracks)
            .set({
              musicbrainzId: mbTrack.recordingMbid,
              canonicalTitle: mbTrack.title,
            })
            .where(eq(tracks.id, localId))
            .run();
          resolutionProgress.resolved++;
        }
      }

      if (details.artistMbid) {
        resolveArtistMbid(
          album.artistId,
          details.artistMbid,
          details.artistName,
        );
      }

      break;
    }
  }
}

function matchLocalTracks(
  localTracks: Array<{
    id: string;
    title: string;
    trackNumber: number | null;
    discNumber: number | null;
  }>,
  mbTracks: MBReleaseTrack[],
): Array<{ localId: string; mbTrack: MBReleaseTrack | undefined }> {
  return localTracks.map((local) => {
    let mbTrack: MBReleaseTrack | undefined;

    if (local.trackNumber !== null) {
      const disc = local.discNumber ?? 1;
      mbTrack = mbTracks.find(
        (t) => t.trackPosition === local.trackNumber && t.discPosition === disc,
      );
    }

    if (!mbTrack) {
      const norm = normalizeString(local.title);
      mbTrack = mbTracks.find((t) => normalizeString(t.title) === norm);
    }

    return { localId: local.id, mbTrack };
  });
}

async function runRecordingSearchFallback(): Promise<void> {
  const unresolved = db
    .select({
      trackId: tracks.id,
      title: tracks.title,
      albumId: tracks.albumId,
      artistId: tracks.artistId,
      artistName: artists.name,
      albumTitle: albums.title,
      releaseYear: albums.releaseYear,
    })
    .from(tracks)
    .innerJoin(artists, eq(tracks.artistId, artists.id))
    .leftJoin(albums, eq(tracks.albumId, albums.id))
    .where(isNull(tracks.musicbrainzId))
    .all();

  console.log(
    `[resolver] recording search fallback: ${unresolved.length} tracks`,
  );

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
        .set({
          musicbrainzId: match.recordingMbid,
          ...(match.mbTrackTitle ? { canonicalTitle: match.mbTrackTitle } : {}),
        })
        .where(eq(tracks.id, track.trackId))
        .run();
      if (match.releaseMbid && track.albumId) {
        const albumResult = db
          .update(albums)
          .set({ musicbrainzId: match.releaseMbid })
          .where(
            and(eq(albums.id, track.albumId), isNull(albums.musicbrainzId)),
          )
          .run();
        if (albumResult.changes > 0) {
          void fetchAndStoreCoverArt(track.albumId, match.releaseMbid);
        }
      }
      if (match.mbArtistId && track.artistId) {
        resolveArtistMbid(track.artistId, match.mbArtistId, match.mbArtistName);
      }
      resolutionProgress.resolved++;
    } else {
      resolutionProgress.failed++;
    }
  }
}

async function fetchAndStoreCoverArt(
  albumId: string,
  releaseMbid: string,
  releaseGroupMbid?: string,
): Promise<void> {
  let url = await fetchCoverArtUrl(releaseMbid);
  if (url === "" && releaseGroupMbid) {
    url = await fetchCoverArtUrlForGroup(releaseGroupMbid);
  }
  if (releaseGroupMbid || url !== null) {
    db.update(albums)
      .set({
        ...(releaseGroupMbid ? { releaseGroupMbid } : {}),
        ...(url !== null ? { coverArtUrl: url } : {}),
      })
      .where(eq(albums.id, albumId))
      .run();
  }
}

async function runCoverArtRetryPass(): Promise<void> {
  const needsRetry = db
    .select({
      albumId: albums.id,
      musicbrainzId: albums.musicbrainzId,
      releaseGroupMbid: albums.releaseGroupMbid,
    })
    .from(albums)
    .where(and(isNotNull(albums.musicbrainzId), eq(albums.coverArtUrl, "")))
    .all();

  if (needsRetry.length === 0) return;
  console.log(`[resolver] cover art retry: ${needsRetry.length} albums`);

  for (const album of needsRetry) {
    let rgMbid = album.releaseGroupMbid ?? undefined;

    if (!rgMbid) {
      const res = await throttledFetch(
        `https://musicbrainz.org/ws/2/release/${album.musicbrainzId}?inc=release-groups&fmt=json`,
      );
      if (!res.ok) continue;
      const data = (await res.json()) as { "release-group"?: { id: string } };
      rgMbid = data["release-group"]?.id;
      if (!rgMbid) continue;
    }

    const url = await fetchCoverArtUrlForGroup(rgMbid);
    if (url !== null && url !== "") {
      db.update(albums)
        .set({ coverArtUrl: url, releaseGroupMbid: rgMbid })
        .where(eq(albums.id, album.albumId))
        .run();
    }
  }
}

function resolveArtistMbid(
  localArtistId: string,
  mbArtistId: string,
  mbArtistName: string | null,
): void {
  const canonical = db
    .select({ id: artists.id })
    .from(artists)
    .where(eq(artists.musicbrainzId, mbArtistId))
    .get();

  if (canonical && canonical.id !== localArtistId) {
    db.update(tracks)
      .set({ artistId: canonical.id })
      .where(eq(tracks.artistId, localArtistId))
      .run();
    db.update(albums)
      .set({ artistId: canonical.id })
      .where(eq(albums.artistId, localArtistId))
      .run();
    db.delete(artists).where(eq(artists.id, localArtistId)).run();
    if (mbArtistName) {
      db.update(artists)
        .set({ canonicalName: mbArtistName })
        .where(eq(artists.id, canonical.id))
        .run();
    }
  } else if (!canonical) {
    db.update(artists)
      .set({
        musicbrainzId: mbArtistId,
        ...(mbArtistName ? { canonicalName: mbArtistName } : {}),
      })
      .where(eq(artists.id, localArtistId))
      .run();
  }
}

async function runFingerprintPass(): Promise<void> {
  const apiKey = process.env.ACOUSTID_API_KEY;
  if (!apiKey) {
    console.log(
      "[resolver] ACOUSTID_API_KEY not set — skipping fingerprint pass",
    );
    return;
  }

  const available = await isFpcalcAvailable();
  if (!available) {
    console.log("[resolver] fpcalc not found — skipping fingerprint pass");
    return;
  }

  const unresolved = db
    .select({ trackId: tracks.id, filePath: tracks.filePath })
    .from(tracks)
    .where(
      and(
        isNull(tracks.musicbrainzId),
        eq(tracks.fingerprintStatus, "pending"),
      ),
    )
    .all();

  console.log(`[resolver] fingerprint pass: ${unresolved.length} tracks`);

  for (const track of unresolved) {
    db.update(tracks)
      .set({ fingerprintStatus: "processing" })
      .where(eq(tracks.id, track.trackId))
      .run();

    const fp = await fingerprintFile(track.filePath);
    if (!fp) {
      db.update(tracks)
        .set({ fingerprintStatus: "failed" })
        .where(eq(tracks.id, track.trackId))
        .run();
      continue;
    }

    const match = await lookupFingerprint(fp.duration, fp.fingerprint, apiKey);
    if (match) {
      db.update(tracks)
        .set({
          musicbrainzId: match.recordingMbid,
          fingerprintStatus: "matched",
        })
        .where(eq(tracks.id, track.trackId))
        .run();
      resolutionProgress.resolved++;
    } else {
      db.update(tracks)
        .set({ fingerprintStatus: "failed" })
        .where(eq(tracks.id, track.trackId))
        .run();
    }
  }
}

async function runArtistImagePass(): Promise<void> {
  const unresolved = db
    .select({ id: artists.id, musicbrainzId: artists.musicbrainzId })
    .from(artists)
    .where(and(isNotNull(artists.musicbrainzId), isNull(artists.imageUrl)))
    .all();

  if (unresolved.length === 0) return;
  console.log(`[resolver] artist image pass: ${unresolved.length} artists`);

  for (const artist of unresolved) {
    try {
      const mbRes = await throttledFetch(
        `https://musicbrainz.org/ws/2/artist/${artist.musicbrainzId}?inc=url-rels&fmt=json`,
      );
      if (!mbRes.ok) continue;
      const mbData = (await mbRes.json()) as {
        relations?: Array<{ type: string; url: { resource: string } }>;
      };

      const wikidataRel = mbData.relations?.find((r) => r.type === "wikidata");
      if (!wikidataRel) continue;

      const qid = wikidataRel.url.resource.split("/wiki/")[1];
      if (!qid) continue;

      const wdRes = await fetch(
        `https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`,
      );
      if (!wdRes.ok) continue;
      const wdData = (await wdRes.json()) as {
        entities: Record<
          string,
          {
            claims?: {
              P18?: Array<{
                mainsnak: { datavalue?: { value: string } };
              }>;
            };
          }
        >;
      };

      const filename =
        wdData.entities[qid]?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
      if (!filename) continue;

      const imageUrl = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}`;
      db.update(artists)
        .set({ imageUrl })
        .where(eq(artists.id, artist.id))
        .run();
    } catch {}
  }
}

async function runAlbumBackfillFromTracks(): Promise<void> {
  const toBackfill = db
    .selectDistinct({
      albumId: albums.id,
      title: albums.title,
    })
    .from(albums)
    .innerJoin(tracks, eq(tracks.albumId, albums.id))
    .where(and(isNull(albums.musicbrainzId), isNotNull(tracks.musicbrainzId)))
    .all();

  if (toBackfill.length === 0) return;
  console.log(
    `[resolver] album backfill from tracks: ${toBackfill.length} albums`,
  );

  for (const album of toBackfill) {
    const resolvedTrackMbids = db
      .select({ musicbrainzId: tracks.musicbrainzId })
      .from(tracks)
      .where(
        and(eq(tracks.albumId, album.albumId), isNotNull(tracks.musicbrainzId)),
      )
      .all()
      .map((t) => t.musicbrainzId!);

    const normalizedAlbumTitle = normalizeString(album.title);
    let matchingRelease:
      | {
          id: string;
          title: string;
          status?: string;
          "release-group"?: { id: string };
        }
      | undefined;

    for (const recordingMbid of resolvedTrackMbids) {
      const res = await throttledFetch(
        `https://musicbrainz.org/ws/2/recording/${recordingMbid}?inc=releases+release-groups&fmt=json`,
      );
      if (!res.ok) continue;

      const data = (await res.json()) as {
        releases?: Array<{
          id: string;
          title: string;
          status?: string;
          "release-group"?: { id: string };
        }>;
      };

      if (!data.releases?.length) continue;

      const candidate =
        data.releases.find(
          (r) =>
            normalizeString(r.title) === normalizedAlbumTitle &&
            r.status === "Official",
        ) ??
        data.releases.find(
          (r) => normalizeString(r.title) === normalizedAlbumTitle,
        ) ??
        data.releases.find((r) => r.status === "Official");

      if (candidate) {
        matchingRelease = candidate;
        break;
      }
    }

    if (!matchingRelease) {
      console.log(
        `[resolver/backfill] "${album.title}" — no matching release found across ${resolvedTrackMbids.length} resolved tracks`,
      );
      continue;
    }

    const releaseGroupMbid = matchingRelease["release-group"]?.id;
    db.update(albums)
      .set({
        musicbrainzId: matchingRelease.id,
        canonicalTitle: matchingRelease.title,
        ...(releaseGroupMbid ? { releaseGroupMbid } : {}),
      })
      .where(and(eq(albums.id, album.albumId), isNull(albums.musicbrainzId)))
      .run();

    void fetchAndStoreCoverArt(
      album.albumId,
      matchingRelease.id,
      releaseGroupMbid,
    );
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

        const dupeAlbums = db
          .select({ id: albums.id, title: albums.title })
          .from(albums)
          .where(eq(albums.artistId, dupeId))
          .all();

        for (const dupeAlbum of dupeAlbums) {
          const canonicalAlbum = db
            .select({ id: albums.id })
            .from(albums)
            .where(
              and(
                eq(albums.artistId, canonicalId),
                eq(albums.title, dupeAlbum.title),
              ),
            )
            .get();

          if (canonicalAlbum) {
            db.update(tracks)
              .set({ albumId: canonicalAlbum.id })
              .where(eq(tracks.albumId, dupeAlbum.id))
              .run();
            db.delete(albums).where(eq(albums.id, dupeAlbum.id)).run();
          } else {
            db.update(albums)
              .set({ artistId: canonicalId })
              .where(eq(albums.id, dupeAlbum.id))
              .run();
          }
        }

        db.delete(artists).where(eq(artists.id, dupeId)).run();
      }
    }
  });
}
