import { inArray } from "drizzle-orm";
import { db } from "../client.js";
import { tracks } from "../schema/tracks.js";
import { logger } from "../../logger.js";
import { upsertArtist } from "./artists.js";
import { updateAlbumByAlbumId } from "./albums.js";
import {
  getTracksInAlbum,
  getDominantArtistIdForAlbum,
  updateTrackByTrackId,
} from "./tracks.js";
import { replaceTrackArtists, type TrackArtistInput } from "./track-artists.js";
import { replaceAlbumArtists } from "./album-artists.js";
import { upsertTrackFts } from "./tracks-fts.js";
import type { AlbumEditRequest, AlbumEditTrack } from "@staccato/shared";

const log = logger.child({ module: "db:album-edit" });

export interface AlbumEditCounts {
  updatedTracks: number;
  removedTracks: number;
  attachedTracks: number;
}

// Resolve a track's free-text credits into DB artist rows (creating new artists
// as needed) and re-derive positions from order. Returns the resolved inputs
// plus the lead artist (position 0), which becomes the track's `artistId`.
function resolveTrackCredits(
  track: AlbumEditTrack,
  fallbackArtistId: string,
  fallbackArtistName: string,
): {
  inputs: TrackArtistInput[];
  leadArtistId: string;
  leadArtistName: string;
} {
  const ordered = [...track.artists].sort((a, b) => a.position - b.position);
  const inputs: TrackArtistInput[] = ordered.map((credit, position) => ({
    artistId: upsertArtist(credit.name),
    position,
    joinPhrase: credit.joinPhrase,
  }));

  if (inputs.length === 0) {
    // tracks.artistId is NOT NULL — fall back to the album artist.
    return {
      inputs,
      leadArtistId: fallbackArtistId,
      leadArtistName: fallbackArtistName,
    };
  }
  return {
    inputs,
    leadArtistId: inputs[0]!.artistId,
    leadArtistName: ordered[0]!.name,
  };
}

// Persist a full manual album edit in one transaction (overwrite model — writes
// straight to the canonical rows, no per-field lock). The payload carries the
// complete post-edit album + ordered tracklist; we diff it against the album's
// current tracks to derive detaches (removed) and attach-from-library (new ids).
//
// `payload.coverArtUrl` must already be the final value to persist (a local
// /metadata/covers path or null) — the async download/cache happens in the route
// handler before this synchronous transaction.
export function applyAlbumEdit(
  albumId: string,
  payload: AlbumEditRequest,
): AlbumEditCounts {
  return db.transaction(() => {
    const currentIds = new Set(getTracksInAlbum(albumId).map((t) => t.id));
    const payloadIds = new Set(payload.tracks.map((t) => t.trackId));
    const removedIds = [...currentIds].filter((id) => !payloadIds.has(id));
    const attachedIds = [...payloadIds].filter((id) => !currentIds.has(id));

    // ── Album row ──────────────────────────────────────────────────────────
    // Honour the typed artist name directly (no dominant-artist recompute on
    // this album). Write canonicalTitle so COALESCE(canonicalTitle, title)
    // surfaces the edit while the raw discovered tag stays intact.
    const albumArtistId = upsertArtist(payload.artistName);
    updateAlbumByAlbumId(albumId, {
      canonicalTitle: payload.title,
      artistId: albumArtistId,
      releaseYear: payload.releaseYear,
      coverArtUrl: payload.coverArtUrl,
    });
    // The contract carries a single album artist name; keep the release-level
    // credit list consistent with it (single primary credit).
    replaceAlbumArtists(albumId, [
      {
        artistId: albumArtistId,
        position: 0,
        joinPhrase: null,
        isPrimary: true,
      },
    ]);

    // Capture where attached tracks currently live so we can fix up the source
    // albums' dominant artist after moving them out.
    const sourceAlbumIds = new Set<string>();
    if (attachedIds.length > 0) {
      const priorRows = db
        .select({ albumId: tracks.albumId })
        .from(tracks)
        .where(inArray(tracks.id, attachedIds))
        .all();
      for (const row of priorRows) {
        if (row.albumId && row.albumId !== albumId)
          sourceAlbumIds.add(row.albumId);
      }
    }

    // ── Per-track (existing + attached) ────────────────────────────────────
    for (const track of payload.tracks) {
      const { inputs, leadArtistId, leadArtistName } = resolveTrackCredits(
        track,
        albumArtistId,
        payload.artistName,
      );
      updateTrackByTrackId(track.trackId, {
        canonicalTitle: track.title,
        trackNumber: track.trackNumber,
        discNumber: track.discNumber,
        artistId: leadArtistId,
        albumId, // also performs the attach for ids not previously on the album
      });
      replaceTrackArtists(track.trackId, inputs);
      upsertTrackFts(track.trackId, track.title, leadArtistName, payload.title);
    }

    // ── Removed tracks → detach (keep the row + cascaded playlist/history) ──
    // Known gap (accepted): a detached track may be re-resolved and re-attached
    // to this album by a later scan.
    for (const id of removedIds) {
      updateTrackByTrackId(id, { albumId: null });
    }

    // ── Source-album fixup: recompute lead artist for albums we pulled from ──
    for (const srcId of sourceAlbumIds) {
      const dominant = getDominantArtistIdForAlbum(srcId);
      if (dominant) updateAlbumByAlbumId(srcId, { artistId: dominant });
    }

    log.info(
      {
        albumId,
        updatedTracks: payload.tracks.length - attachedIds.length,
        removedTracks: removedIds.length,
        attachedTracks: attachedIds.length,
      },
      "album edit persisted",
    );

    return {
      updatedTracks: payload.tracks.length - attachedIds.length,
      removedTracks: removedIds.length,
      attachedTracks: attachedIds.length,
    };
  });
}
