import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { sql } from "drizzle-orm";
import {
  AlbumSortSchema,
  ArtistSortSchema,
  parsePagination,
} from "@staccato/shared";
import {
  countArtists,
  getArtists,
  searchArtists,
} from "../db/queries/artists.js";
import {
  countAlbums,
  getAlbumsWithArtistDetails,
  searchAlbums,
} from "../db/queries/albums.js";
import { countTracks, getLibraryTracks } from "../db/queries/tracks.js";
import {
  groupCreditsByTrack,
  listTrackArtistsForTracks,
} from "../db/queries/track-artists.js";
import { listAlbumArtistsForAlbums } from "../db/queries/album-artists.js";
import { db } from "../db/client.js";
import { resolveAlbumCoverNow } from "../coverart/store.js";
import { resolveArtistImageNow } from "../artistimage/store.js";

const libraryRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/artists", async (request) => {
    const query = z
      .object({
        limit: z.string().optional(),
        offset: z.string().optional(),
        sort: z.string().optional(),
      })
      .parse(request.query);
    const paginationOptions = parsePagination(query);
    const sort = ArtistSortSchema.catch("createdAt").parse(query.sort);

    const items = getArtists(paginationOptions, sort);
    const total = countArtists();

    return {
      items: items.map((r) => ({
        ...r,
        imageUrl: resolveArtistImageNow({
          artistId: r.id,
          musicbrainzId: r.musicbrainzId,
          imageUrl: r.imageUrl,
        }),
        createdAt: r.createdAt?.toISOString() ?? null,
      })),
      total,
    };
  });

  fastify.get("/albums", async (request) => {
    const query = z
      .object({
        limit: z.string().optional(),
        offset: z.string().optional(),
        sort: z.string().optional(),
      })
      .parse(request.query);
    const paginationOptions = parsePagination(query);
    const sort = AlbumSortSchema.catch("createdAt").parse(query.sort);

    const items = getAlbumsWithArtistDetails(paginationOptions, sort);
    const total = countAlbums();
    const creditsByAlbum = listAlbumArtistsForAlbums(items.map((i) => i.id));

    return {
      items: items.map((r) => ({
        ...r,
        coverArtUrl: resolveAlbumCoverNow({
          albumId: r.id,
          releaseGroupMbid: r.releaseGroupMbid,
          coverArtUrl: r.coverArtUrl,
        }),
        createdAt: r.createdAt?.toISOString() ?? null,
        artists: creditsByAlbum.get(r.id) ?? [],
      })),
      total,
    };
  });

  fastify.get("/tracks", async (request) => {
    const query = z
      .object({ limit: z.string().optional(), offset: z.string().optional() })
      .parse(request.query);
    const paginationOptions = parsePagination(query);

    const items = getLibraryTracks(paginationOptions);
    const total = countTracks();
    const credits = groupCreditsByTrack(
      listTrackArtistsForTracks(items.map((i) => i.id)),
    );

    return {
      items: items.map((r) => ({
        ...r,
        coverArtUrl: r.albumId
          ? resolveAlbumCoverNow({
              albumId: r.albumId,
              releaseGroupMbid: r.releaseGroupMbid,
              coverArtUrl: r.coverArtUrl,
            })
          : r.coverArtUrl,
        artists: credits.get(r.id) ?? [],
      })),
      total,
    };
  });

  fastify.get("/search", async (request) => {
    const { q } = z.object({ q: z.string().optional() }).parse(request.query);
    if (!q || q.trim().length < 2)
      return { artists: [], albums: [], tracks: [] };
    const term = q.trim();
    const pattern = `%${term}%`;

    const artistResults = searchArtists(pattern, 5);
    const albumResults = searchAlbums(pattern, 8);
    const albumCreditsByAlbum = listAlbumArtistsForAlbums(
      albumResults.map((r) => r.id),
    );

    // FTS5 prefix match — Drizzle doesn't support FTS, raw SQL stays inline
    const ftsQuery = buildTracksFtsQuery(term);
    const trackRows = db.all(
      ftsQuery
        ? sql`
            SELECT
              t.id,
              t.title,
              ar.name       AS artist_name,
              al.id         AS album_id,
              al.title      AS album_title,
              al.release_group_mbid AS release_group_mbid,
              t.duration_seconds,
              al.cover_art_url
            FROM tracks_fts f
            JOIN tracks  t  ON t.id  = f.track_id
            JOIN artists ar ON ar.id = t.artist_id
            LEFT JOIN albums al ON al.id = t.album_id
            WHERE tracks_fts MATCH ${ftsQuery}
            ORDER BY rank
            LIMIT 20
          `
        : sql`
            SELECT
              t.id,
              t.title,
              ar.name       AS artist_name,
              al.id         AS album_id,
              al.title      AS album_title,
              al.release_group_mbid AS release_group_mbid,
              t.duration_seconds,
              al.cover_art_url
            FROM tracks t
            JOIN artists ar ON ar.id = t.artist_id
            LEFT JOIN albums al ON al.id = t.album_id
            WHERE
              t.title LIKE ${pattern}
              OR ar.name LIKE ${pattern}
              OR al.title LIKE ${pattern}
            LIMIT 20
          `,
    ) as Array<{
      id: string;
      title: string;
      artist_name: string;
      album_id: string | null;
      album_title: string | null;
      release_group_mbid: string | null;
      duration_seconds: number | null;
      cover_art_url: string | null;
    }>;

    const trackCredits = groupCreditsByTrack(
      listTrackArtistsForTracks(trackRows.map((r) => r.id)),
    );

    return {
      artists: artistResults.map((r) => ({
        ...r,
        imageUrl: resolveArtistImageNow({
          artistId: r.id,
          musicbrainzId: r.musicbrainzId,
          imageUrl: r.imageUrl,
        }),
      })),
      albums: albumResults.map((r) => ({
        ...r,
        coverArtUrl: resolveAlbumCoverNow({
          albumId: r.id,
          releaseGroupMbid: r.releaseGroupMbid,
          coverArtUrl: r.coverArtUrl,
        }),
        createdAt: r.createdAt?.toISOString() ?? null,
        artists: albumCreditsByAlbum.get(r.id) ?? [],
      })),
      tracks: trackRows.map((r) => ({
        id: r.id,
        title: r.title,
        artistName: r.artist_name,
        albumId: r.album_id,
        albumTitle: r.album_title,
        durationSeconds: r.duration_seconds,
        coverArtUrl: r.album_id
          ? resolveAlbumCoverNow({
              albumId: r.album_id,
              releaseGroupMbid: r.release_group_mbid,
              coverArtUrl: r.cover_art_url,
            })
          : r.cover_art_url,
        artists: trackCredits.get(r.id) ?? [],
      })),
    };
  });
};

function buildTracksFtsQuery(term: string): string | null {
  const tokens = term.match(/[\p{L}\p{N}]+/gu) ?? [];
  if (tokens.length === 0) return null;
  return tokens.map((token) => `${token.toLowerCase()}*`).join(" AND ");
}

export default libraryRoutes;
