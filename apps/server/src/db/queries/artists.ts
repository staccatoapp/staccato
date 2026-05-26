import {
  and,
  asc,
  count,
  eq,
  isNotNull,
  isNull,
  like,
  notExists,
  or,
  sql,
} from "drizzle-orm";
import { db } from "../client.js";
import { artists } from "../schema/artists.js";
import { albums } from "../schema/albums.js";
import { albumArtists } from "../schema/album-artists.js";
import { tracks } from "../schema/tracks.js";
import { SQLiteUpdateSetSource } from "drizzle-orm/sqlite-core";
import { PaginationOptions } from "@staccato/shared";
import { normalizeString } from "../../musicbrainz/client.js";

export type ArtistRow = {
  id: string;
  name: string;
  musicbrainzId: string | null;
  imageUrl: string | null;
  createdAt: Date | null;
  albumCount: number;
};

export function getArtists(paginationOptions: PaginationOptions): ArtistRow[] {
  return db
    .select({
      id: artists.id,
      name: sql<string>`COALESCE(${artists.canonicalName}, ${artists.name})`,
      musicbrainzId: artists.musicbrainzId,
      imageUrl: artists.imageUrl,
      createdAt: artists.createdAt,
      // Albums the artist owns: legacy single-artist primary (albums.artist_id)
      // OR a primary release-level credit (album_artists). Matches the artist
      // page's Discography so a co-owned collaboration counts for both artists.
      albumCount: sql<number>`(
        SELECT COUNT(*) FROM ${albums} al
        WHERE al.artist_id = ${artists.id}
           OR EXISTS (
             SELECT 1 FROM ${albumArtists} aa
             WHERE aa.album_id = al.id
               AND aa.artist_id = ${artists.id}
               AND aa.is_primary = 1
           )
      )`.mapWith(Number),
    })
    .from(artists)
    .orderBy(asc(sql`COALESCE(${artists.canonicalName}, ${artists.name})`))
    .limit(paginationOptions.limit)
    .offset(paginationOptions.offset)
    .all();
}

export type ArtistSearchRow = {
  id: string;
  name: string;
  musicbrainzId: string | null;
  imageUrl: string | null;
};

export function searchArtists(
  pattern: string,
  limit: number,
): ArtistSearchRow[] {
  return db
    .select({
      id: artists.id,
      name: sql<string>`COALESCE(${artists.canonicalName}, ${artists.name})`,
      musicbrainzId: artists.musicbrainzId,
      imageUrl: artists.imageUrl,
    })
    .from(artists)
    .where(
      or(like(artists.name, pattern), like(artists.canonicalName, pattern)),
    )
    .limit(limit)
    .all();
}

export type ArtistDetailsRow = {
  id: string;
  name: string;
  musicbrainzId: string | null;
  imageUrl: string | null;
};

export function getArtistDetails(
  artistId: string,
): ArtistDetailsRow | undefined {
  return db
    .select({
      id: artists.id,
      name: sql<string>`COALESCE(${artists.canonicalName}, ${artists.name})`,
      musicbrainzId: artists.musicbrainzId,
      imageUrl: artists.imageUrl,
    })
    .from(artists)
    .where(eq(artists.id, artistId))
    .get();
}

export function getArtistIdByMbid(artistMbid: string): string | null {
  const result = db
    .select({ id: artists.id })
    .from(artists)
    .where(eq(artists.musicbrainzId, artistMbid))
    .get();
  return result?.id ?? null;
}

// Raw identity fields for a single artist row. Used by the resolver's
// find-or-create to decide whether a discovered placeholder row is still
// unclaimed (no MBID) and matches the credit by name. `getArtistDetails`
// coalesces the name and omits normalizedName, so it can't serve this.
export function getArtistRowById(
  artistId: string,
):
  | { id: string; normalizedName: string | null; musicbrainzId: string | null }
  | undefined {
  return db
    .select({
      id: artists.id,
      normalizedName: artists.normalizedName,
      musicbrainzId: artists.musicbrainzId,
    })
    .from(artists)
    .where(eq(artists.id, artistId))
    .get();
}

export function getResolvedArtistsWithoutCoverArt() {
  return db
    .select({ id: artists.id, musicbrainzId: artists.musicbrainzId })
    .from(artists)
    .where(
      and(
        isNotNull(artists.musicbrainzId),
        or(
          isNull(artists.imageUrl),
          // also re-process rows holding stale wikimedia URLs from before
          // we moved artist images onto the local disk store
          sql`${artists.imageUrl} NOT LIKE '/metadata/artists/%'`,
        ),
      ),
    )
    .all();
}
export type ResolvedArtistWithoutCoverArt = ReturnType<
  typeof getResolvedArtistsWithoutCoverArt
>[number];

export function countArtists(): number {
  const result = db.select({ count: count() }).from(artists).get();
  return result?.count || 0;
}

export function deleteOrphanArtists(): void {
  db.delete(artists)
    .where(
      and(
        notExists(
          db
            .select({ id: albums.id })
            .from(albums)
            .where(eq(albums.artistId, artists.id))
            .limit(1),
        ),
        notExists(
          db
            .select({ id: tracks.id })
            .from(tracks)
            .where(eq(tracks.artistId, artists.id))
            .limit(1),
        ),
      ),
    )
    .run();
}

export function updateArtist(artistId: string, artistUpdate: ArtistUpdate) {
  db.update(artists).set(artistUpdate).where(eq(artists.id, artistId)).run();
}
export type ArtistUpdate = SQLiteUpdateSetSource<typeof artists>;

export function deleteArtist(artistId: string) {
  db.delete(artists).where(eq(artists.id, artistId)).run();
}

export function upsertArtist(name: string, mbid?: string | null): string {
  const normalizedInput = normalizeString(name);

  const sqlMatch = db
    .select({ id: artists.id, musicbrainzId: artists.musicbrainzId })
    .from(artists)
    .where(eq(artists.normalizedName, normalizedInput))
    .get();
  if (sqlMatch) {
    if (mbid && !sqlMatch.musicbrainzId) trySetArtistMbid(sqlMatch.id, mbid);
    return sqlMatch.id;
  }

  const allArtists = db
    .select({
      id: artists.id,
      name: artists.name,
      normalizedName: artists.normalizedName,
      canonicalName: artists.canonicalName,
      musicbrainzId: artists.musicbrainzId,
    })
    .from(artists)
    .all();
  const match = allArtists.find(
    (a) =>
      (a.normalizedName == null &&
        normalizeString(a.name) === normalizedInput) ||
      (a.canonicalName != null &&
        normalizeString(a.canonicalName) === normalizedInput),
  );
  if (match) {
    if (match.normalizedName == null) {
      db.update(artists)
        .set({ normalizedName: normalizeString(match.name) })
        .where(eq(artists.id, match.id))
        .run();
    }
    if (mbid && !match.musicbrainzId) trySetArtistMbid(match.id, mbid);
    return match.id;
  }

  return db
    .insert(artists)
    .values({
      name,
      normalizedName: normalizedInput,
      musicbrainzId: mbid ?? null,
    })
    .onConflictDoUpdate({
      target: artists.name,
      set: { name, normalizedName: normalizedInput },
    })
    .returning({ id: artists.id })
    .get()!.id;
}

function trySetArtistMbid(artistId: string, mbid: string): void {
  try {
    db.update(artists)
      .set({ musicbrainzId: mbid })
      .where(eq(artists.id, artistId))
      .run();
  } catch {
    // unique constraint: mbid belongs to another artist — leave it for resolver dedup
  }
}
