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
import { albums } from "../schema/albums.js";
import { artists } from "../schema/artists.js";
import { tracks } from "../schema/tracks.js";
import { SQLiteUpdateSetSource } from "drizzle-orm/sqlite-core";
import { RunResult } from "better-sqlite3";
import { PaginationOptions } from "@staccato/shared";

export type AlbumWithArtistDetailsRow = {
  id: string;
  title: string;
  artistId: string;
  artistName: string;
  releaseYear: number | null;
  coverArtUrl: string | null;
  createdAt: Date | null;
};

export function getAlbumsByArtistId(artistId: string) {
  return db
    .select({ id: albums.id, title: albums.title })
    .from(albums)
    .where(eq(albums.artistId, artistId))
    .all();
}
export type AlbumByArtistId = ReturnType<typeof getAlbumsByArtistId>[number];

export function getAlbumIdByTitleAndArtistId(title: string, artistId: string) {
  return db
    .select({ id: albums.id })
    .from(albums)
    .where(and(eq(albums.artistId, artistId), eq(albums.title, title)))
    .get();
}
export type AlbumIdByTitleAndArtistId = ReturnType<
  typeof getAlbumIdByTitleAndArtistId
>;

export function getAlbumsWithArtistDetails(
  paginationOptions: PaginationOptions,
): AlbumWithArtistDetailsRow[] {
  return db
    .select({
      id: albums.id,
      title: sql<string>`COALESCE(${albums.canonicalTitle}, ${albums.title})`,
      artistId: albums.artistId,
      artistName: sql<string>`COALESCE(${artists.canonicalName}, ${artists.name})`,
      releaseYear: albums.releaseYear,
      coverArtUrl: albums.coverArtUrl,
      createdAt: albums.createdAt,
    })
    .from(albums)
    .innerJoin(artists, eq(albums.artistId, artists.id))
    .orderBy(
      asc(sql`COALESCE(${artists.canonicalName}, ${artists.name})`),
      asc(sql`COALESCE(${albums.canonicalTitle}, ${albums.title})`),
    )
    .limit(paginationOptions.limit)
    .offset(paginationOptions.offset)
    .all();
}

export function getAlbumWithArtistDetails(
  albumId: string,
): AlbumWithArtistDetailsRow | undefined {
  return db
    .select({
      id: albums.id,
      title: sql<string>`COALESCE(${albums.canonicalTitle}, ${albums.title})`,
      artistId: albums.artistId,
      artistName: sql<string>`COALESCE(${artists.canonicalName}, ${artists.name})`,
      releaseYear: albums.releaseYear,
      coverArtUrl: albums.coverArtUrl,
      createdAt: albums.createdAt,
    })
    .from(albums)
    .innerJoin(artists, eq(albums.artistId, artists.id))
    .where(eq(albums.id, albumId))
    .get();
}

export function searchAlbums(
  pattern: string,
  limit: number,
): AlbumWithArtistDetailsRow[] {
  return db
    .select({
      id: albums.id,
      title: sql<string>`COALESCE(${albums.canonicalTitle}, ${albums.title})`,
      artistId: albums.artistId,
      artistName: sql<string>`COALESCE(${artists.canonicalName}, ${artists.name})`,
      releaseYear: albums.releaseYear,
      coverArtUrl: albums.coverArtUrl,
      createdAt: albums.createdAt,
    })
    .from(albums)
    .innerJoin(artists, eq(albums.artistId, artists.id))
    .where(
      or(
        like(albums.title, pattern),
        like(albums.canonicalTitle, pattern),
        like(artists.name, pattern),
        like(artists.canonicalName, pattern),
      ),
    )
    .limit(limit)
    .all();
}

export function getAlbumByArtist(artistId: string): { id: string } | undefined {
  return db
    .select({ id: albums.id })
    .from(albums)
    .where(eq(albums.artistId, artistId))
    .limit(1)
    .get();
}

export function getUnresolvedAlbums() {
  return db
    .select({
      albumId: albums.id,
      title: albums.title,
      artistId: albums.artistId,
      artistName: artists.name,
    })
    .from(albums)
    .innerJoin(artists, eq(albums.artistId, artists.id))
    .where(isNull(albums.releaseGroupMbid))
    .all();
}
export type UnresolvedAlbumRow = ReturnType<typeof getUnresolvedAlbums>[number];

export function getResolvedAlbumsWithoutCoverArt() {
  return db
    .select({
      albumId: albums.id,
      releaseGroupMbid: albums.releaseGroupMbid,
    })
    .from(albums)
    .where(and(isNotNull(albums.releaseGroupMbid), or(isNull(albums.coverArtUrl), eq(albums.coverArtUrl, ""))))
    .all();
}
export type ResolvedAlbumWithoutCoverArt = ReturnType<
  typeof getResolvedAlbumsWithoutCoverArt
>[number];

export function getUnresolvedAlbumsContainingResolvedTracks() {
  return db
    .selectDistinct({
      albumId: albums.id,
      title: albums.title,
    })
    .from(albums)
    .innerJoin(tracks, eq(tracks.albumId, albums.id))
    .where(and(isNull(albums.releaseGroupMbid), isNotNull(tracks.musicbrainzId)))
    .all();
}
export type UnresolvedAlbumContainingResolvedTracks = ReturnType<
  typeof getUnresolvedAlbumsContainingResolvedTracks
>[number];

export function getAlbumsNeedingTagResolution() {
  return db
    .select({
      albumId: albums.id,
      releaseMbid: albums.releaseMbid,
      artistId: albums.artistId,
    })
    .from(albums)
    .where(and(isNotNull(albums.releaseMbid), isNull(albums.releaseGroupMbid)))
    .all();
}
export type AlbumNeedingTagResolution = ReturnType<
  typeof getAlbumsNeedingTagResolution
>[number];

export function countAlbums(): number {
  const result = db.select({ count: count() }).from(albums).get();
  return result?.count || 0;
}

export function deleteOrphanAlbums(): void {
  db.delete(albums)
    .where(
      notExists(
        db
          .select({ id: tracks.id })
          .from(tracks)
          .where(eq(tracks.albumId, albums.id))
          .limit(1),
      ),
    )
    .run();
}

export function updateAlbumByAlbumId(
  albumId: string,
  albumUpdate: AlbumUpdate,
): RunResult {
  return updateAlbumBaseQuery(albumUpdate).where(eq(albums.id, albumId)).run();
}

export function updateUnresolvedAlbum(
  albumId: string,
  albumUpdate: AlbumUpdate,
): RunResult {
  return updateAlbumBaseQuery(albumUpdate)
    .where(and(eq(albums.id, albumId), isNull(albums.releaseGroupMbid)))
    .run();
}

export function updateAlbumByArtistId(
  artistId: string,
  albumUpdate: AlbumUpdate,
) {
  return updateAlbumBaseQuery(albumUpdate)
    .where(eq(albums.artistId, artistId))
    .run();
}

function updateAlbumBaseQuery(albumUpdate: AlbumUpdate) {
  return db.update(albums).set(albumUpdate);
}
export type AlbumUpdate = SQLiteUpdateSetSource<typeof albums>;

export function deleteAlbum(albumId: string) {
  db.delete(albums).where(eq(albums.id, albumId)).run();
}
