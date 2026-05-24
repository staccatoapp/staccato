import { asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../client.js";
import { albumArtists } from "../schema/album-artists.js";
import { artists } from "../schema/artists.js";
import type { AlbumArtistCredit } from "@staccato/shared";

export interface AlbumArtistInput {
  artistId: string;
  position: number;
  joinPhrase: string | null;
  // true = co-owner of the album, false = feature guest. See computePrimaryFlags.
  isPrimary: boolean;
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
          isPrimary: c.isPrimary,
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

// Batch variant of listAlbumArtists for a page of albums. One query keyed on
// album_id IN (...), grouped per album in position order. Used to attach the
// full credit list to album listing/search responses.
export function listAlbumArtistsForAlbums(
  albumIds: string[],
): Map<string, AlbumArtistCredit[]> {
  const byAlbum = new Map<string, AlbumArtistCredit[]>();
  if (albumIds.length === 0) return byAlbum;

  const rows = db
    .select({
      albumId: albumArtists.albumId,
      artistId: albumArtists.artistId,
      name: sql<string>`COALESCE(${artists.canonicalName}, ${artists.name})`,
      joinPhrase: albumArtists.joinPhrase,
      position: albumArtists.position,
    })
    .from(albumArtists)
    .innerJoin(artists, eq(albumArtists.artistId, artists.id))
    .where(inArray(albumArtists.albumId, albumIds))
    .orderBy(asc(albumArtists.position))
    .all();

  for (const { albumId, ...credit } of rows) {
    const list = byAlbum.get(albumId);
    if (list) list.push(credit);
    else byAlbum.set(albumId, [credit]);
  }
  return byAlbum;
}
