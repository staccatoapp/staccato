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
import {
  countUnresolvedTracks,
  getResolvedTrackMbidsByAlbumId,
  getUnresolvedTracksByAlbum,
  getUnresolvedTracksPendingFingerprint,
  getUnresolvedTracksWithAlbumAndArtistDetails,
  updateTrackByAlbumId,
  updateTrackByArtistId,
  updateTrackByTrackId,
} from "../db/queries/tracks.js";
import {
  deleteAlbum,
  getAlbumIdByTitleAndArtistId,
  getAlbumsByArtistId,
  getResolvedAlbumsWithoutCoverArt,
  getUnresolvedAlbums,
  getUnresolvedAlbumsContainingResolvedTracks,
  updateAlbumByAlbumId,
  updateAlbumByArtistId,
  updateUnresolvedAlbum,
} from "../db/queries/albums.js";
import {
  deleteArtist,
  getArtistIdByMbid,
  getAllDuplicateArtists,
  getResolvedArtistsWithoutCoverArt,
  updateArtist,
  getNonCanonicalDuplicateArtistIds,
} from "../db/queries/artists.js";

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
    dedupeArtistsAndAlbums();
    await runArtistImagePass();
    resolutionProgress.completedAt = new Date();
  } catch (err) {
    console.error("[resolver] fatal error", err);
  } finally {
    resolutionProgress.running = false;
  }
}

async function runAlbumFirstPass(): Promise<void> {
  resolutionProgress.total = countUnresolvedTracks();

  const unresolvedAlbums = getUnresolvedAlbums();

  console.log(`[resolver] album-first pass: ${unresolvedAlbums.length} albums`);

  for (const album of unresolvedAlbums) {
    const localTracks = getUnresolvedTracksByAlbum(album.albumId);

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

      const albumResult = updateUnresolvedAlbum(album.albumId, {
        musicbrainzId: releaseMbid,
        ...(details.releaseName ? { canonicalTitle: details.releaseName } : {}),
      });

      if (albumResult.changes > 0) {
        void fetchAndStoreCoverArt(
          album.albumId,
          releaseMbid,
          details.releaseGroupMbid ?? undefined,
        );
      }

      for (const { localId, mbTrack } of matched) {
        if (mbTrack) {
          updateTrackByTrackId(localId, {
            musicbrainzId: mbTrack.recordingMbid,
            canonicalTitle: mbTrack.title,
          });
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
  const unresolved = getUnresolvedTracksWithAlbumAndArtistDetails();

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
      updateTrackByTrackId(track.trackId, {
        musicbrainzId: match.recordingMbid,
        ...(match.mbTrackTitle ? { canonicalTitle: match.mbTrackTitle } : {}),
      });
      if (match.releaseMbid && track.albumId) {
        const albumResult = updateUnresolvedAlbum(track.albumId, {
          musicbrainzId: match.releaseMbid,
        });
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
    updateAlbumByAlbumId(albumId, {
      ...(releaseGroupMbid ? { releaseGroupMbid } : {}),
      ...(url !== null ? { coverArtUrl: url } : {}),
    });
  }
}

async function runCoverArtRetryPass(): Promise<void> {
  const needsRetry = getResolvedAlbumsWithoutCoverArt();

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
      updateAlbumByAlbumId(album.albumId, {
        coverArtUrl: url,
        releaseGroupMbid: rgMbid,
      });
    }
  }
}

function resolveArtistMbid(
  localArtistId: string,
  mbArtistId: string,
  mbArtistName: string | null,
): void {
  const canonicalArtistId = getArtistIdByMbid(mbArtistId);

  if (canonicalArtistId && canonicalArtistId !== localArtistId) {
    updateTrackByArtistId(localArtistId, { artistId: canonicalArtistId });
    updateAlbumByArtistId(localArtistId, { artistId: canonicalArtistId });
    deleteArtist(localArtistId);
    if (mbArtistName) {
      updateArtist(canonicalArtistId, { canonicalName: mbArtistName });
    }
  } else if (!canonicalArtistId) {
    updateArtist(localArtistId, {
      musicbrainzId: mbArtistId,
      ...(mbArtistName ? { canonicalName: mbArtistName } : {}),
    });
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

  const unresolved = getUnresolvedTracksPendingFingerprint();

  console.log(`[resolver] fingerprint pass: ${unresolved.length} tracks`);

  for (const track of unresolved) {
    updateTrackByTrackId(track.trackId, { fingerprintStatus: "processing" });

    const fp = await fingerprintFile(track.filePath);
    if (!fp) {
      updateTrackByTrackId(track.trackId, { fingerprintStatus: "failed" });
      continue;
    }

    const match = await lookupFingerprint(fp.duration, fp.fingerprint, apiKey);
    if (match) {
      updateTrackByTrackId(track.trackId, {
        musicbrainzId: match.recordingMbid,
        fingerprintStatus: "matched",
      });
      resolutionProgress.resolved++;
    } else {
      updateTrackByTrackId(track.trackId, { fingerprintStatus: "failed" });
    }
  }
}

async function runArtistImagePass(): Promise<void> {
  const artistsMissingCoverArt = getResolvedArtistsWithoutCoverArt();

  if (artistsMissingCoverArt.length === 0) return;
  console.log(
    `[resolver] artist image pass: ${artistsMissingCoverArt.length} artists`,
  );

  for (const artist of artistsMissingCoverArt) {
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
      updateArtist(artist.id, { imageUrl });
    } catch {}
  }
}

async function runAlbumBackfillFromTracks(): Promise<void> {
  const albumsToBackfill = getUnresolvedAlbumsContainingResolvedTracks();

  if (albumsToBackfill.length === 0) return;
  console.log(
    `[resolver] album backfill from tracks: ${albumsToBackfill.length} albums`,
  );

  for (const album of albumsToBackfill) {
    const resolvedTrackMbids = getResolvedTrackMbidsByAlbumId(album.albumId);

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
    updateUnresolvedAlbum(album.albumId, {
      musicbrainzId: matchingRelease.id,
      canonicalTitle: matchingRelease.title,
      ...(releaseGroupMbid ? { releaseGroupMbid } : {}),
    });

    void fetchAndStoreCoverArt(
      album.albumId,
      matchingRelease.id,
      releaseGroupMbid,
    );
  }
}

// im not 100% sure why this is happening on rescans since we compare normalized names earlier in the pipeline, but it is. harmless to just dedupe after
function dedupeArtistsAndAlbums(): void {
  const dupes = getAllDuplicateArtists();

  if (dupes.length === 0) return;

  for (const { musicbrainzId, canonicalId } of dupes) {
    const dupeArtistIds = getNonCanonicalDuplicateArtistIds(
      musicbrainzId,
      canonicalId,
    );

    for (const dupeArtistId of dupeArtistIds) {
      updateTrackByArtistId(dupeArtistId, { artistId: canonicalId });

      const dupeAlbums = getAlbumsByArtistId(dupeArtistId);

      for (const dupeAlbum of dupeAlbums) {
        const canonicalAlbumId = getAlbumIdByTitleAndArtistId(
          dupeAlbum.title,
          canonicalId,
        );

        if (canonicalAlbumId) {
          updateTrackByAlbumId(dupeAlbum.id, {
            albumId: canonicalAlbumId.id,
          });
          deleteAlbum(dupeAlbum.id);
        } else {
          updateAlbumByAlbumId(dupeAlbum.id, { artistId: canonicalId });
        }
      }

      deleteArtist(dupeArtistId);
    }
  }
}
