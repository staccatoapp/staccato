import {
  getListenAggregatesForUser,
  type ListenAggregate,
} from "../../../../db/queries/listening-history.js";
import {
  getSimilarArtists,
  getSimilarTags,
} from "../../../../lastfm/client.js";
import { getTagsCached } from "../../../../lastfm/tag-cache.js";
import { classifyTrackGenres } from "../genre-blend.js";
import { buildHeardIndex } from "../heard.js";
import type {
  AlbumAffinity,
  ArtistAffinity,
  DecadeAffinity,
  GenreAffinity,
  PartialProfile,
  ProfileContext,
  SignalExtractor,
} from "../types.js";
import { recencyDecay, trackWeight } from "../weighting.js";

// How many top affinities seed the adjacency fan-out (keeps Last.fm calls bounded).
const ADJACENCY_SEED_GENRES = 3;
const ADJACENCY_SEED_ARTISTS = 3;

function topNormalised<T extends { weight: number }>(items: T[]): T[] {
  const total = items.reduce((sum, i) => sum + i.weight, 0);
  if (total === 0) return [];
  return items
    .map((i) => ({ ...i, weight: i.weight / total }))
    .sort((a, b) => b.weight - a.weight);
}

/** Fetch the genre vector for one track using track + album + artist tags. */
async function classifyAggregate(agg: ListenAggregate) {
  const [trackTags, albumTags, artistTags] = await Promise.all([
    getTagsCached("track", {
      mbid: agg.recordingMbid,
      artist: agg.artistName,
      title: agg.title,
    }),
    agg.albumTitle
      ? getTagsCached("album", {
          mbid: agg.releaseGroupMbid,
          artist: agg.artistName,
          album: agg.albumTitle,
        })
      : Promise.resolve([]),
    getTagsCached("artist", {
      mbid: agg.artistMbid,
      artist: agg.artistName,
    }),
  ]);
  return classifyTrackGenres({
    track: trackTags,
    album: albumTags,
    artist: artistTags,
  });
}

export const listeningHistoryExtractor: SignalExtractor = {
  id: "listening-history",

  async extract(userId: string, ctx: ProfileContext): Promise<PartialProfile> {
    const aggregates = getListenAggregatesForUser(userId);
    ctx.log.info(
      { userId, trackCount: aggregates.length },
      "listening-history extractor: building profile",
    );

    const genreScores = new Map<string, number>();
    // Recency-decayed breadth: sum of per-track decay over DISTINCT tracks in a
    // genre (one entry per aggregate), independent of the play-count weighting
    // that drives ordering. Feeds GenreAffinity.effectiveRecentTracks (spec §6).
    const genreEffective = new Map<string, number>();
    const artistScores = new Map<
      string,
      { affinity: Omit<ArtistAffinity, "weight">; weight: number }
    >();
    const albumScores = new Map<
      string,
      { affinity: Omit<AlbumAffinity, "weight">; weight: number }
    >();
    const decadeScores = new Map<number, number>();

    for (const agg of aggregates) {
      const weight = trackWeight(agg.playCount, agg.lastListenedAtMs, ctx.now);
      // Distinct-track recency decay (no play-count factor) for the gate metric.
      const decay = recencyDecay(agg.lastListenedAtMs, ctx.now);

      // Genre: distribute the track weight across its blended genre vector.
      const vector = await classifyAggregate(agg);
      if (vector) {
        for (const [genre, share] of vector) {
          genreScores.set(
            genre,
            (genreScores.get(genre) ?? 0) + weight * share,
          );
          genreEffective.set(genre, (genreEffective.get(genre) ?? 0) + decay);
        }
      } else {
        ctx.log.debug(
          { trackId: agg.trackId, title: agg.title },
          "track unclassified (no genre cleared threshold)",
        );
      }

      // Artist affinity.
      const aKey = agg.artistMbid ?? agg.artistName;
      const aPrev = artistScores.get(aKey);
      artistScores.set(aKey, {
        affinity: { artistName: agg.artistName, artistMbid: agg.artistMbid },
        weight: (aPrev?.weight ?? 0) + weight,
      });

      // Album affinity.
      if (agg.albumId && agg.albumTitle) {
        const alPrev = albumScores.get(agg.albumId);
        albumScores.set(agg.albumId, {
          affinity: { albumId: agg.albumId, albumTitle: agg.albumTitle },
          weight: (alPrev?.weight ?? 0) + weight,
        });
      }

      // Decade affinity.
      if (agg.releaseYear != null) {
        const decade = Math.floor(agg.releaseYear / 10) * 10;
        decadeScores.set(decade, (decadeScores.get(decade) ?? 0) + weight);
      }
    }

    const genreAffinity: GenreAffinity[] = topNormalised(
      [...genreScores].map(([genre, weight]) => ({
        genre,
        weight,
        effectiveRecentTracks: genreEffective.get(genre) ?? 0,
      })),
    );
    const artistAffinity: ArtistAffinity[] = topNormalised(
      [...artistScores.values()].map((v) => ({
        ...v.affinity,
        weight: v.weight,
      })),
    );
    const albumAffinity: AlbumAffinity[] = topNormalised(
      [...albumScores.values()].map((v) => ({
        ...v.affinity,
        weight: v.weight,
      })),
    );
    const decadeAffinity: DecadeAffinity[] = topNormalised(
      [...decadeScores].map(([decade, weight]) => ({ decade, weight })),
    );

    // Adjacency: neighbours of the top affinities, excluding existing top picks.
    const seedGenres = new Set(
      genreAffinity.slice(0, ADJACENCY_SEED_GENRES).map((g) => g.genre),
    );
    const seedArtists = new Set(
      artistAffinity.slice(0, ADJACENCY_SEED_ARTISTS).map((a) => a.artistName),
    );
    const [simTagLists, simArtistLists] = await Promise.all([
      Promise.all([...seedGenres].map((g) => getSimilarTags(g))),
      Promise.all([...seedArtists].map((a) => getSimilarArtists(a))),
    ]);
    const adjacencyTags = [...new Set(simTagLists.flat())].filter(
      (t) => !seedGenres.has(t.toLowerCase()),
    );
    const adjacencyArtists = [...new Set(simArtistLists.flat())].filter(
      (a) => !seedArtists.has(a),
    );

    return {
      genreAffinity,
      artistAffinity,
      albumAffinity,
      decadeAffinity,
      adjacency: { tags: adjacencyTags, artists: adjacencyArtists },
      heard: buildHeardIndex(
        aggregates.map((a) => ({
          recordingMbid: a.recordingMbid,
          playCount: a.playCount,
          lastListenedAtMs: a.lastListenedAtMs,
        })),
      ),
    };
  },
};
