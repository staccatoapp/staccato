import { asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../client.js";
import { trackArtists } from "../schema/track-artists.js";
import { artists } from "../schema/artists.js";
import type { TrackArtistCredit } from "@staccato/shared";

export interface TrackArtistInput {
  artistId: string;
  position: number;
  joinPhrase: string | null;
}

export function replaceTrackArtists(
  trackId: string,
  credits: TrackArtistInput[],
): void {
  db.transaction(() => {
    db.delete(trackArtists).where(eq(trackArtists.trackId, trackId)).run();
    if (credits.length === 0) return;
    db.insert(trackArtists)
      .values(
        credits.map((c) => ({
          trackId,
          artistId: c.artistId,
          position: c.position,
          joinPhrase: c.joinPhrase,
        })),
      )
      .run();
  });
}

export function deleteTrackArtists(trackId: string): void {
  db.delete(trackArtists).where(eq(trackArtists.trackId, trackId)).run();
}

export interface TrackArtistRow {
  artistId: string;
  position: number;
  joinPhrase: string | null;
}

export function listTrackArtists(trackId: string): TrackArtistRow[] {
  return db
    .select({
      artistId: trackArtists.artistId,
      position: trackArtists.position,
      joinPhrase: trackArtists.joinPhrase,
    })
    .from(trackArtists)
    .where(eq(trackArtists.trackId, trackId))
    .all();
}

export interface TrackCreditRow {
  trackId: string;
  artistId: string;
  name: string;
  joinPhrase: string | null;
  position: number;
}

// Batch-load artist credits for many tracks at once (lead at position 0 plus
// any guests), joined to the canonical/display artist name. Ordered by track
// then position so callers can group in a single pass. Returns [] for empty
// input so callers never issue an `IN ()`.
export function listTrackArtistsForTracks(
  trackIds: string[],
): TrackCreditRow[] {
  if (trackIds.length === 0) return [];
  return db
    .select({
      trackId: trackArtists.trackId,
      artistId: trackArtists.artistId,
      name: sql<string>`COALESCE(${artists.canonicalName}, ${artists.name})`,
      joinPhrase: trackArtists.joinPhrase,
      position: trackArtists.position,
    })
    .from(trackArtists)
    .innerJoin(artists, eq(trackArtists.artistId, artists.id))
    .where(inArray(trackArtists.trackId, trackIds))
    .orderBy(asc(trackArtists.trackId), asc(trackArtists.position))
    .all();
}

// Group flat credit rows into per-track ordered credit lists keyed by trackId.
// Order is preserved from the query (position asc).
export function groupCreditsByTrack(
  rows: TrackCreditRow[],
): Map<string, TrackArtistCredit[]> {
  const map = new Map<string, TrackArtistCredit[]>();
  for (const r of rows) {
    const credit: TrackArtistCredit = {
      artistId: r.artistId,
      name: r.name,
      joinPhrase: r.joinPhrase,
      position: r.position,
    };
    const list = map.get(r.trackId);
    if (list) list.push(credit);
    else map.set(r.trackId, [credit]);
  }
  return map;
}
