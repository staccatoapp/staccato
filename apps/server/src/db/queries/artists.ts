import {
  and,
  asc,
  count,
  eq,
  isNotNull,
  isNull,
  like,
  ne,
  notExists,
  or,
  sql,
} from "drizzle-orm";
import { db } from "../client.js";
import { artists } from "../schema/artists.js";
import { albums } from "../schema/albums.js";
import { tracks } from "../schema/tracks.js";
import { SQLiteUpdateSetSource } from "drizzle-orm/sqlite-core";
import { PaginationOptions } from "@staccato/shared";

export type ArtistRow = {
  id: string;
  name: string;
  imageUrl: string | null;
  createdAt: Date | null;
};

export function getArtists(paginationOptions: PaginationOptions): ArtistRow[] {
  return db
    .select({
      id: artists.id,
      name: sql<string>`COALESCE(${artists.canonicalName}, ${artists.name})`,
      imageUrl: artists.imageUrl,
      createdAt: artists.createdAt,
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
      imageUrl: artists.imageUrl,
    })
    .from(artists)
    .where(
      or(like(artists.name, pattern), like(artists.canonicalName, pattern)),
    )
    .limit(limit)
    .all();
}

export function getArtistIdByMbid(artistMbid: string): string | null {
  const result = db
    .select({ id: artists.id })
    .from(artists)
    .where(eq(artists.musicbrainzId, artistMbid))
    .get();
  return result?.id ?? null;
}

export function getResolvedArtistsWithoutCoverArt() {
  return db
    .select({ id: artists.id, musicbrainzId: artists.musicbrainzId })
    .from(artists)
    .where(and(isNotNull(artists.musicbrainzId), isNull(artists.imageUrl)))
    .all();
}
export type ResolvedArtistWithoutCoverArt = ReturnType<
  typeof getResolvedArtistsWithoutCoverArt
>[number];

export function getAllDuplicateArtists() {
  return db
    .select({
      musicbrainzId: artists.musicbrainzId,
      canonicalId: sql<string>`(SELECT id FROM artists a2 WHERE a2.musicbrainz_id = artists.musicbrainz_id ORDER BY a2.created_at ASC LIMIT 1)`,
    })
    .from(artists)
    .where(isNotNull(artists.musicbrainzId))
    .groupBy(artists.musicbrainzId)
    .having(sql`count(*) > 1`)
    .all()
    .map((a) => {
      return { musicbrainzId: a.musicbrainzId!, canonicalId: a.canonicalId };
    });
}
export type DuplicateArtist = ReturnType<typeof getAllDuplicateArtists>[number];

export function getNonCanonicalDuplicateArtistIds(
  mbId: string,
  canonicalId: string,
) {
  return db
    .select({ id: artists.id })
    .from(artists)
    .where(and(eq(artists.musicbrainzId, mbId), ne(artists.id, canonicalId)))
    .all()
    .map((r) => r.id);
}
export type NonCanonicalDuplicateArtistId = ReturnType<
  typeof getNonCanonicalDuplicateArtistIds
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
