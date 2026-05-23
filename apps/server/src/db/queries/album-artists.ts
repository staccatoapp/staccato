import { asc, eq, sql } from "drizzle-orm";
import { db } from "../client.js";
import { albumArtists } from "../schema/album-artists.js";
import { artists } from "../schema/artists.js";
import type { AlbumArtistCredit } from "@staccato/shared";

export interface AlbumArtistInput {
  artistId: string;
  position: number;
  joinPhrase: string | null;
}

// Replace an album's full release-level credit list in one shot. Wrapped in a
// transaction so a concurrent reader never sees a half-written list.
export function replaceAlbumArtists(
  albumId: string,
  credits: AlbumArtistInput[],
): void {
  db.transaction(() => {
    db.delete(albumArtists).where(eq(albumArtists.albumId, albumId)).run();
    if (credits.length === 0) return;
    db.insert(albumArtists)
      .values(
        credits.map((c) => ({
          albumId,
          artistId: c.artistId,
          position: c.position,
          joinPhrase: c.joinPhrase,
        })),
      )
      .run();
  });
}

// Ordered release-level credit list for one album, joined to the display name.
export function listAlbumArtists(albumId: string): AlbumArtistCredit[] {
  return db
    .select({
      artistId: albumArtists.artistId,
      name: sql<string>`COALESCE(${artists.canonicalName}, ${artists.name})`,
      joinPhrase: albumArtists.joinPhrase,
      position: albumArtists.position,
    })
    .from(albumArtists)
    .innerJoin(artists, eq(albumArtists.artistId, artists.id))
    .where(eq(albumArtists.albumId, albumId))
    .orderBy(asc(albumArtists.position))
    .all();
}
