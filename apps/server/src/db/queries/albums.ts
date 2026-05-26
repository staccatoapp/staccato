import {
  and,
  asc,
  count,
  eq,
  exists,
  isNull,
  like,
  ne,
  notExists,
  or,
  sql,
} from "drizzle-orm";
import { db } from "../client.js";
import { albums } from "../schema/albums.js";
import { artists } from "../schema/artists.js";
import { tracks } from "../schema/tracks.js";
import { trackArtists } from "../schema/track-artists.js";
import { albumArtists } from "../schema/album-artists.js";
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
  confidenceScore: number | null;
  pendingTrackCount: number;
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

// Correlated subquery: the artist is a *primary* (owning) release-level credit
// on the outer `albums` row. Used both positively (discography membership) and
// negatively (excluding owners from "Appears On"). Correlates on albums.id, so
// the outer query must select from / join `albums`.
function primaryAlbumArtistSubquery(artistId: string) {
  return db
    .select({ x: sql`1` })
    .from(albumArtists)
    .where(
      and(
        eq(albumArtists.albumId, albums.id),
        eq(albumArtists.artistId, artistId),
        eq(albumArtists.isPrimary, true),
      ),
    );
}

// Albums the artist owns: either the legacy single-artist primary
// (albums.artist_id) or a primary release-level credit in album_artists. The
// album_artists branch is what lets a collaborative album ("MF Doom & MF
// Grimm") appear in the Discography of every co-owner, not just the dominant
// track artist held in albums.artist_id.
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
    .where(
      or(
        eq(albums.artistId, artistId),
        exists(primaryAlbumArtistSubquery(artistId)),
      ),
    )
    .all();
}

// Albums the artist guests on — has at least one track credit (track_artists)
// but does NOT own the album (neither albums.artist_id nor a primary
// album_artists credit). Drives the artist page's "Appears On" grid.
export function getAppearsOnAlbumsByArtistId(
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
    .from(trackArtists)
    .innerJoin(tracks, eq(trackArtists.trackId, tracks.id))
    .innerJoin(albums, eq(tracks.albumId, albums.id))
    .where(
      and(
        eq(trackArtists.artistId, artistId),
        ne(albums.artistId, artistId),
        notExists(primaryAlbumArtistSubquery(artistId)),
      ),
    )
    .groupBy(albums.id)
    .all();
}

// Albums the artist is a release-level *guest* on — credited in album_artists
// with is_primary = 0 (e.g. an album-level "feat."). Owners are excluded by the
// is_primary filter; the artist route unions this with track-level appearances.
export function getReleaseCoCreditAlbumsByArtistId(
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
    .from(albumArtists)
    .innerJoin(albums, eq(albumArtists.albumId, albums.id))
    .where(
      and(
        eq(albumArtists.artistId, artistId),
        eq(albumArtists.isPrimary, false),
      ),
    )
    .groupBy(albums.id)
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
      confidenceScore: albums.confidenceScore,
      pendingTrackCount: sql<number>`(SELECT COUNT(*) FROM tracks WHERE tracks.album_id = ${albums.id} AND tracks.resolution_status IN ('pending','resolving'))`,
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
      confidenceScore: albums.confidenceScore,
      pendingTrackCount: sql<number>`(SELECT COUNT(*) FROM tracks WHERE tracks.album_id = ${albums.id} AND tracks.resolution_status IN ('pending','resolving'))`,
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
      confidenceScore: albums.confidenceScore,
      pendingTrackCount: sql<number>`(SELECT COUNT(*) FROM tracks WHERE tracks.album_id = ${albums.id} AND tracks.resolution_status IN ('pending','resolving'))`,
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
      confidenceScore: albums.confidenceScore,
      pendingTrackCount: sql<number>`(SELECT COUNT(*) FROM tracks WHERE tracks.album_id = ${albums.id} AND tracks.resolution_status IN ('pending','resolving'))`,
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
        releaseMbid
          ? eq(albums.releaseMbid, releaseMbid)
          : isNull(albums.releaseMbid),
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
