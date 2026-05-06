import { sql } from "drizzle-orm";
import { db } from "../client.js";

export function upsertTrackFts(
  trackId: string,
  title: string,
  artistName: string,
  albumTitle: string,
): void {
  db.run(sql`DELETE FROM tracks_fts WHERE track_id = ${trackId}`);
  db.run(sql`
    INSERT INTO tracks_fts (track_id, title, artist_name, album_title)
    VALUES (${trackId}, ${title}, ${artistName}, ${albumTitle})
  `);
}

export function deleteTrackFts(trackId: string): void {
  db.run(sql`DELETE FROM tracks_fts WHERE track_id = ${trackId}`);
}
