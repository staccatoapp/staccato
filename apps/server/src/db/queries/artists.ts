import { and, eq, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { db } from "../client.js";
import { artists } from "../schema/artists.js";
import { SQLiteUpdateSetSource } from "drizzle-orm/sqlite-core";

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

export function updateArtist(artistId: string, artistUpdate: ArtistUpdate) {
  db.update(artists).set(artistUpdate).where(eq(artists.id, artistId)).run();
}
export type ArtistUpdate = SQLiteUpdateSetSource<typeof artists>;

export function deleteArtist(artistId: string) {
  db.delete(artists).where(eq(artists.id, artistId)).run();
}
