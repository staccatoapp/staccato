import { eq } from "drizzle-orm";
import { db } from "../client.js";
import { trackArtists } from "../schema/track-artists.js";

export interface TrackArtistInput {
  artistId: string;
  position: number;
  joinPhrase: string | null;
}

export function replaceTrackArtists(
  trackId: string,
  credits: TrackArtistInput[],
): void {
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
