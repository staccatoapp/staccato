import {
  and,
  asc,
  count,
  eq,
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
import { normalizeString } from "../../musicbrainz/client.js";

export type AlbumWithArtistDetailsRow = {
  id: string;
  title: string;
  artistId: string;
  artistName: string;
  releaseYear: number | null;
  releaseMbid: string | null;
  releaseGroupMbid: string | null;
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

export type DiscographyAlbumRow = {
  id: string;
  title: string;
  releaseYear: number | null;
  releaseGroupMbid: string | null;
  coverArtUrl: string | null;
};

export function getDiscographyAlbumsByArtistId(
  artistId: string,
): DiscographyAlbumRow[] {
  return db
    .select({
      id: albums.id,
      title: sql<string>`COALESCE(${albums.canonicalTitle}, ${albums.title})`,
      releaseYear: albums.releaseYear,
      releaseGroupMbid: albums.releaseGroupMbid,
      coverArtUrl: albums.coverArtUrl,
    })
    .from(albums)
    .where(eq(albums.artistId, artistId))
    .all();
}

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
      releaseMbid: albums.releaseMbid,
      releaseGroupMbid: albums.releaseGroupMbid,
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
      releaseMbid: albums.releaseMbid,
      releaseGroupMbid: albums.releaseGroupMbid,
      coverArtUrl: albums.coverArtUrl,
      createdAt: albums.createdAt,
    })
    .from(albums)
    .innerJoin(artists, eq(albums.artistId, artists.id))
    .where(eq(albums.id, albumId))
    .get();
}

export function getAlbumByMbid(
  mbid: string,
): AlbumWithArtistDetailsRow | undefined {
  return db
    .select({
      id: albums.id,
      title: sql<string>`COALESCE(${albums.canonicalTitle}, ${albums.title})`,
      artistId: albums.artistId,
      artistName: sql<string>`COALESCE(${artists.canonicalName}, ${artists.name})`,
      releaseYear: albums.releaseYear,
      releaseMbid: albums.releaseMbid,
      releaseGroupMbid: albums.releaseGroupMbid,
      coverArtUrl: albums.coverArtUrl,
      createdAt: albums.createdAt,
    })
    .from(albums)
    .innerJoin(artists, eq(albums.artistId, artists.id))
    .where(or(eq(albums.releaseGroupMbid, mbid), eq(albums.releaseMbid, mbid)))
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
      releaseMbid: albums.releaseMbid,
      releaseGroupMbid: albums.releaseGroupMbid,
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

export type AlbumRow = typeof albums.$inferSelect;

// Discovery-time upsert: file's raw album tag becomes a row. release_mbid is
// usually NULL at this point. Multiple unresolved rows with the same
// (title, artistId, NULL) are tolerated — the unique index treats NULLs as
// distinct in SQLite, but we deduplicate manually here to avoid creating
// duplicate placeholder rows. The pipeline later assigns the real
// release_mbid; that may collide with a sibling row, in which case
// `findAlbumByReleaseMbid` returns it and `mergeAlbums` collapses them.
export function upsertAlbumForDiscovery(
  title: string,
  artistId: string,
  releaseYear: number | null,
  releaseMbid: string | null,
  releaseGroupMbid: string | null,
): string {
  const normalizedInput = normalizeString(title);

  if (releaseMbid) {
    const existing = db
      .select({ id: albums.id })
      .from(albums)
      .where(
        and(eq(albums.artistId, artistId), eq(albums.releaseMbid, releaseMbid)),
      )
      .get();
    if (existing) return existing.id;
  }

  const existingUnresolved = db
    .select({ id: albums.id })
    .from(albums)
    .where(
      and(
        eq(albums.artistId, artistId),
        eq(albums.normalizedTitle, normalizedInput),
        releaseMbid ? eq(albums.releaseMbid, releaseMbid) : isNull(albums.releaseMbid),
      ),
    )
    .get();
  if (existingUnresolved) return existingUnresolved.id;

  return db
    .insert(albums)
    .values({
      title,
      artistId,
      releaseYear,
      normalizedTitle: normalizedInput,
      releaseMbid,
      releaseGroupMbid,
    })
    .returning({ id: albums.id })
    .get()!.id;
}

export function findAlbumByReleaseMbid(
  artistId: string,
  releaseMbid: string,
): AlbumRow | undefined {
  return db
    .select()
    .from(albums)
    .where(
      and(eq(albums.artistId, artistId), eq(albums.releaseMbid, releaseMbid)),
    )
    .get();
}

export function getAlbumById(albumId: string): AlbumRow | undefined {
  return db.select().from(albums).where(eq(albums.id, albumId)).get();
}
