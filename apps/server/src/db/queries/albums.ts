import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "../client.js";
import { albums } from "../schema/albums.js";
import { artists } from "../schema/artists.js";
import { SQLiteUpdateSetSource } from "drizzle-orm/sqlite-core";
import { RunResult } from "better-sqlite3";
import { tracks } from "../schema/tracks.js";

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
    .where(isNull(albums.musicbrainzId))
    .all();
}
export type UnresolvedAlbumRow = ReturnType<typeof getUnresolvedAlbums>[number];

export function getResolvedAlbumsWithoutCoverArt() {
  return db
    .select({
      albumId: albums.id,
      musicbrainzId: albums.musicbrainzId,
      releaseGroupMbid: albums.releaseGroupMbid,
    })
    .from(albums)
    .where(and(isNotNull(albums.musicbrainzId), eq(albums.coverArtUrl, "")))
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
    .where(and(isNull(albums.musicbrainzId), isNotNull(tracks.musicbrainzId)))
    .all();
}
export type UnresolvedAlbumContainingResolvedTracks = ReturnType<
  typeof getUnresolvedAlbumsContainingResolvedTracks
>[number];

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
    .where(and(eq(albums.id, albumId), isNull(albums.musicbrainzId)))
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
